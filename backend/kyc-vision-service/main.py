"""
KYC Vision Microservice — FastAPI + opencv-python
Endpoints:
  POST /detect-face     : YuNet via cv2.FaceDetectorYN (résout pb 12 tenseurs onnxruntime-node)
  POST /anti-spoofing   : MiniFASNetV2 anti-spoofing passif
  POST /stamp-ocr       : Détecte le tampon rond, applique warpPolar, retourne l'OCR du texte circulaire

Raison d'existence : YuNet retourne 12 tenseurs séparés nécessitant le décodage d'ancres + NMS fait
en interne par OpenCV C++ — impossible à faire proprement via onnxruntime-node brut.
Voir: https://github.com/opencv/opencv_zoo/issues/192

Usage:
    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 5010
"""

import io
import os
import math
import logging
import tempfile
import time
import sys
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse
from PIL import Image

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("kyc-vision")

# Les modèles sont dans ../models/ (relatif à ce service, monté en volume Docker)
MODELS_DIR = Path(os.environ.get("MODELS_DIR", "../models"))

YUNET_MODEL_PATH = str(MODELS_DIR / "face_detection_yunet_2023mar.onnx")
ANTISPOOFING_MODEL_PATH = str(MODELS_DIR / "minifasnet_v2.onnx")
MINIVISION_MODELS_DIR = Path(os.environ.get("MINIVISION_MODELS_DIR", str(MODELS_DIR / "silent-face-anti-spoofing")))
MINIVISION_MODEL_PATHS = [
    MINIVISION_MODELS_DIR / "2.7_80x80_MiniFASNetV2.pth",
    MINIVISION_MODELS_DIR / "4_0_0_80x80_MiniFASNetV1SE.pth",
]
SFACE_MODEL_PATH = str(MODELS_DIR / "face_recognition_sface_2021dec.onnx")

# Seuil abaissé à 0.3 : les portraits sur documents burundais (petite taille dans une grande image)
# ont des scores ~0.35-0.39 avec YuNet — 0.6 rate tous les visages de documents
YUNET_CONF_THRESHOLD = float(os.environ.get("YUNET_CONF_THRESHOLD", "0.3"))
YUNET_NMS_THRESHOLD = float(os.environ.get("YUNET_NMS_THRESHOLD", "0.3"))
ANTISPOOFING_REAL_THRESHOLD = float(os.environ.get("ANTISPOOFING_REAL_THRESHOLD", "0.75"))
SFACE_COSINE_THRESHOLD = float(os.environ.get("SFACE_COSINE_THRESHOLD", "0.363"))

# Taille d'entrée MiniFASNetV2
ANTISPOOFING_INPUT_SIZE = (80, 80)
# Marge autour de la bounding box pour le recadrage (comme dans le papier original)
FACE_SCALE_MARGIN = 2.7

app = FastAPI(title="KYC Vision Service", version="1.0.0")

# ═══════════════════════════════════════════════════════════════════════════════
# CHARGEMENT DES MODÈLES (au démarrage)
# ═══════════════════════════════════════════════════════════════════════════════

_antispoofing_session: ort.InferenceSession | None = None
_minivision_predictor = None
_sface_recognizer = None
_paddle_ocr = None
_paddle_ocr_config: tuple[str | None, str | None, str, str] | None = None
_realesrgan_session: ort.InferenceSession | None = None
_realesrgan_session_path: str | None = None
_mediapipe_face_mesh = None

OCR_ANCHORS = {
    "IZINA": 120,
    "AMATAZIRANO": 120,
    "SE": 40,
    "NYINA": 90,
    "PROVENSI": 80,
    "KOMINE": 100,
    "YAVUKIYE": 90,
    "ITALIKI": 80,
    "UMUSOZI": 60,
    "IGIKUMU": 90,
    "ITANGIWE": 250,
    "UWUYITANZE": 180,
    "MIFPDI": 400,
    "REPUBLIQUE": 100,
    "BURUNDI": 100,
}

def get_antispoofing_session() -> ort.InferenceSession:
    global _antispoofing_session
    if _antispoofing_session is None:
        if not Path(ANTISPOOFING_MODEL_PATH).exists():
            raise RuntimeError(f"Modèle anti-spoofing manquant: {ANTISPOOFING_MODEL_PATH}")
        logger.info(f"Chargement modèle anti-spoofing: {ANTISPOOFING_MODEL_PATH}")
        _antispoofing_session = ort.InferenceSession(
            ANTISPOOFING_MODEL_PATH,
            providers=["CPUExecutionProvider"]
        )
        logger.info("Modèle anti-spoofing chargé")
    return _antispoofing_session


def get_minivision_predictor():
    global _minivision_predictor
    if _minivision_predictor is not None:
        return _minivision_predictor

    missing = [str(path) for path in MINIVISION_MODEL_PATHS if not path.exists()]
    if missing:
        raise RuntimeError("Poids Minivision officiels manquants: " + ", ".join(missing))

    vendor_root = Path(__file__).resolve().parent / "vendor" / "minivision"
    if str(vendor_root) not in sys.path:
        sys.path.insert(0, str(vendor_root))

    try:
        from src.anti_spoof_predict import AntiSpoofPredict
    except Exception as exc:
        raise RuntimeError(f"Code officiel Minivision indisponible: {exc}") from exc

    _minivision_predictor = AntiSpoofPredict(0)
    return _minivision_predictor


def parse_minivision_model_name(model_path: Path) -> tuple[int, int, float]:
    name = model_path.name
    parts = name.split("_")
    input_part = next((part for part in parts if "x" in part and part.split("x")[0].isdigit()), None)
    if not input_part:
        raise RuntimeError(f"Nom modèle Minivision non reconnu: {name}")
    height, width = (int(value) for value in input_part.split("x"))
    scale = float(parts[0])
    return height, width, scale


def get_sface_recognizer():
    global _sface_recognizer
    if _sface_recognizer is None:
        if not Path(SFACE_MODEL_PATH).exists():
            raise RuntimeError(f"Modèle SFace manquant: {SFACE_MODEL_PATH}")
        logger.info(f"Chargement modèle SFace: {SFACE_MODEL_PATH}")
        _sface_recognizer = cv2.FaceRecognizerSF_create(
            SFACE_MODEL_PATH,
            "",
            cv2.dnn.DNN_BACKEND_OPENCV,
            cv2.dnn.DNN_TARGET_CPU,
        )
        logger.info("Modèle SFace chargé")
    return _sface_recognizer


def get_mediapipe_face_mesh():
    global _mediapipe_face_mesh
    if _mediapipe_face_mesh is None:
        try:
            import mediapipe as mp
        except Exception as exc:
            raise RuntimeError(f"MediaPipe indisponible: {exc}") from exc

        _mediapipe_face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
    return _mediapipe_face_mesh


def create_yunet_detector(input_width: int = 640, input_height: int = 640) -> cv2.FaceDetectorYN:
    """Crée un détecteur YuNet via le vrai wrapper OpenCV (résout le problème des 12 tenseurs)."""
    if not Path(YUNET_MODEL_PATH).exists():
        raise RuntimeError(f"Modèle YuNet manquant: {YUNET_MODEL_PATH}")
    return cv2.FaceDetectorYN_create(
        YUNET_MODEL_PATH,
        "",
        (input_width, input_height),
        score_threshold=YUNET_CONF_THRESHOLD,
        nms_threshold=YUNET_NMS_THRESHOLD,
        top_k=1,  # On veut seulement le visage le plus confiant
    )


def detect_primary_face(img_bgr: np.ndarray) -> np.ndarray | None:
    img_h, img_w = img_bgr.shape[:2]
    detector = create_yunet_detector(img_w, img_h)
    _, faces = detector.detect(img_bgr)
    if faces is None or len(faces) == 0:
        return None
    return faces[0]


def extract_sface_feature(img_bgr: np.ndarray, face: np.ndarray) -> np.ndarray:
    recognizer = get_sface_recognizer()
    # OpenCV Zoo passe le vecteur YuNet sans le dernier score de confiance.
    aligned = recognizer.alignCrop(img_bgr, face[:-1])
    return recognizer.feature(aligned)


def image_rotation_candidates(img_bgr: np.ndarray) -> list[tuple[str, np.ndarray]]:
    return [
        ("rot0", img_bgr),
        ("rot90_clockwise", cv2.rotate(img_bgr, cv2.ROTATE_90_CLOCKWISE)),
        ("rot90_counterclockwise", cv2.rotate(img_bgr, cv2.ROTATE_90_COUNTERCLOCKWISE)),
        ("rot180", cv2.rotate(img_bgr, cv2.ROTATE_180)),
    ]

# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def decode_image(image_bytes: bytes) -> np.ndarray:
    """Décode les bytes d'une image en array numpy BGR (format OpenCV)."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Impossible de décoder l'image")
    return img


def crop_face_with_margin(img: np.ndarray, x: int, y: int, w: int, h: int, scale: float = FACE_SCALE_MARGIN) -> np.ndarray:
    """
    Recadre le visage avec la logique officielle Silent-Face-Anti-Spoofing.
    Le crop agrandit largeur et hauteur séparément, au lieu de produire un carré.
    """
    img_h, img_w = img.shape[:2]
    scale = min((img_h - 1) / max(h, 1), min((img_w - 1) / max(w, 1), scale))

    new_width = w * scale
    new_height = h * scale
    center_x = x + w / 2
    center_y = y + h / 2

    x1 = center_x - new_width / 2
    y1 = center_y - new_height / 2
    x2 = center_x + new_width / 2
    y2 = center_y + new_height / 2

    if x1 < 0:
        x2 -= x1
        x1 = 0
    if y1 < 0:
        y2 -= y1
        y1 = 0
    if x2 > img_w - 1:
        x1 -= x2 - img_w + 1
        x2 = img_w - 1
    if y2 > img_h - 1:
        y1 -= y2 - img_h + 1
        y2 = img_h - 1

    x1 = max(0, int(x1))
    y1 = max(0, int(y1))
    x2 = min(img_w - 1, int(x2))
    y2 = min(img_h - 1, int(y2))
    return img[y1:y2 + 1, x1:x2 + 1]


def image_metrics(img: np.ndarray, label: str) -> dict:
    """Retourne des métriques objectives de lisibilité avant/après nettoyage."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    p05, p95 = np.percentile(gray, [5, 95])
    return {
        "stage": label,
        "width": int(gray.shape[1]),
        "height": int(gray.shape[0]),
        "contrast_std": round(float(gray.std()), 3),
        "contrast_p05_p95": round(float(p95 - p05), 3),
        "sharpness_laplacian_var": round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 3),
        "mean_luma": round(float(gray.mean()), 3),
    }


def order_quad_points(points: np.ndarray) -> np.ndarray:
    pts = points.reshape(4, 2).astype("float32")
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)
    return np.array([
        pts[np.argmin(s)],
        pts[np.argmin(diff)],
        pts[np.argmax(s)],
        pts[np.argmax(diff)],
    ], dtype="float32")


def warp_document_perspective(img_bgr: np.ndarray) -> tuple[np.ndarray, dict]:
    """Détecte le plus grand quadrilatère plausible et applique une correction perspective."""
    img_h, img_w = img_bgr.shape[:2]
    ratio = 1200.0 / max(img_h, img_w)
    small = cv2.resize(img_bgr, None, fx=ratio, fy=ratio, interpolation=cv2.INTER_AREA) if ratio < 1 else img_bgr.copy()
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(blurred, 50, 150)
    edged = cv2.dilate(edged, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

    best = None
    for contour in contours:
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        area = cv2.contourArea(approx)
        if len(approx) == 4 and area > 0.18 * small.shape[0] * small.shape[1]:
            best = approx
            break

    if best is None:
        return img_bgr, {
            "perspective_applied": False,
            "reason": "no_document_quad_found",
        }

    quad = order_quad_points(best / ratio)
    tl, tr, br, bl = quad
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_width = int(max(width_a, width_b))
    max_height = int(max(height_a, height_b))

    if max_width < 300 or max_height < 300:
        return img_bgr, {
            "perspective_applied": False,
            "reason": "quad_too_small",
        }

    dst = np.array([
        [0, 0],
        [max_width - 1, 0],
        [max_width - 1, max_height - 1],
        [0, max_height - 1],
    ], dtype="float32")
    matrix = cv2.getPerspectiveTransform(quad, dst)
    warped = cv2.warpPerspective(img_bgr, matrix, (max_width, max_height), flags=cv2.INTER_CUBIC)

    return warped, {
        "perspective_applied": True,
        "quad": [{"x": round(float(x), 2), "y": round(float(y), 2)} for x, y in quad],
        "warped_width": max_width,
        "warped_height": max_height,
    }


def estimate_text_skew_angle(gray: np.ndarray) -> float:
    inv = cv2.bitwise_not(gray)
    thresh = cv2.threshold(inv, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    coords = np.column_stack(np.where(thresh > 0))
    if coords.shape[0] < 200:
        return 0.0
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = 90 + angle
    return float(angle)


def deskew_image(img_bgr: np.ndarray) -> tuple[np.ndarray, dict]:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    angle = estimate_text_skew_angle(gray)
    if abs(angle) < 0.6 or abs(angle) > 20:
        return img_bgr, {
            "deskew_applied": False,
            "deskew_angle": round(angle, 3),
            "reason": "angle_below_threshold_or_unreliable",
        }

    h, w = img_bgr.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    rotated = cv2.warpAffine(
        img_bgr,
        matrix,
        (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return rotated, {
        "deskew_applied": True,
        "deskew_angle": round(angle, 3),
    }


def adaptive_threshold_for_ocr(img_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, None, h=8, templateWindowSize=7, searchWindowSize=21)
    return cv2.adaptiveThreshold(
        denoised,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        35,
        11,
    )


def _apply_bicubic_unsharp(img_bgr: np.ndarray) -> np.ndarray:
    upscaled = cv2.resize(img_bgr, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
    blurred = cv2.GaussianBlur(upscaled, (0, 0), 1.0)
    return cv2.addWeighted(upscaled, 1.5, blurred, -0.5, 0)


def _get_realesrgan_session(model_path: str) -> ort.InferenceSession:
    global _realesrgan_session, _realesrgan_session_path
    if _realesrgan_session is None or _realesrgan_session_path != model_path:
        _realesrgan_session = ort.InferenceSession(
            model_path,
            providers=["CPUExecutionProvider"],
        )
        _realesrgan_session_path = model_path
    return _realesrgan_session


def _apply_realesrgan_onnx(img_bgr: np.ndarray, model_path: str) -> np.ndarray:
    """
    Exécute Real-ESRGAN ONNX par tuiles pour éviter d'exploser la RAM CPU sur
    les photos de documents. Entrée/sortie BGR uint8.
    """
    session = _get_realesrgan_session(model_path)
    input_name = session.get_inputs()[0].name
    tile = int(os.environ.get("REALESRGAN_TILE_SIZE", "128"))
    overlap = int(os.environ.get("REALESRGAN_TILE_OVERLAP", "16"))
    scale = int(os.environ.get("REALESRGAN_SCALE", "4"))
    h, w = img_bgr.shape[:2]
    output = np.zeros((h * scale, w * scale, 3), dtype=np.float32)
    weight = np.zeros((h * scale, w * scale, 1), dtype=np.float32)

    for y in range(0, h, tile - overlap):
        for x in range(0, w, tile - overlap):
            y0, x0 = y, x
            y1, x1 = min(y0 + tile, h), min(x0 + tile, w)
            patch = img_bgr[y0:y1, x0:x1]
            patch_rgb = cv2.cvtColor(patch, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            inp = np.transpose(patch_rgb, (2, 0, 1))[None, ...]
            pred = session.run(None, {input_name: inp})[0][0]
            pred = np.transpose(pred, (1, 2, 0))
            pred = np.clip(pred, 0, 1)
            pred_bgr = cv2.cvtColor((pred * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR).astype(np.float32)

            oy0, ox0 = y0 * scale, x0 * scale
            oy1, ox1 = oy0 + pred_bgr.shape[0], ox0 + pred_bgr.shape[1]
            output[oy0:oy1, ox0:ox1] += pred_bgr
            weight[oy0:oy1, ox0:ox1] += 1.0

    weight[weight == 0] = 1.0
    return np.clip(output / weight, 0, 255).astype(np.uint8)


def maybe_super_resolve(img_bgr: np.ndarray, metrics_before: dict) -> tuple[np.ndarray, dict]:
    """
    Essaie Real-ESRGAN uniquement si un modèle officiel est explicitement fourni.
    Aucun téléchargement automatique: AGENTS.md interdit les mirrors non vérifiés.
    """
    mode = os.environ.get("OCR_SUPERRES_MODE", "off").lower()
    if mode in {"0", "false", "no", "off", "none"}:
        return img_bgr, {
            "super_resolution_attempted": False,
            "reason": "disabled",
        }

    sharpness = metrics_before["sharpness_laplacian_var"]
    force = os.environ.get("OCR_SUPERRES_FORCE", "false").lower() in {"1", "true", "yes"}
    if not force and sharpness >= float(os.environ.get("OCR_SUPERRES_SHARPNESS_THRESHOLD", "80")):
        return img_bgr, {
            "super_resolution_attempted": False,
            "reason": "sharpness_above_threshold",
        }

    if mode == "bicubic":
        return _apply_bicubic_unsharp(img_bgr), {
            "super_resolution_attempted": True,
            "method": "bicubic_unsharp",
            "applied": True,
        }

    model_path = os.environ.get("REALESRGAN_ONNX_PATH")
    if not model_path:
        return img_bgr, {
            "super_resolution_attempted": True,
            "method": "realesrgan_onnx",
            "applied": False,
            "reason": "REALESRGAN_ONNX_PATH_not_configured",
        }

    if not Path(model_path).exists():
        return img_bgr, {
            "super_resolution_attempted": True,
            "method": "realesrgan_onnx",
            "applied": False,
            "reason": f"model_missing:{model_path}",
        }

    try:
        upscaled = _apply_realesrgan_onnx(img_bgr, model_path)
        return upscaled, {
            "super_resolution_attempted": True,
            "method": "realesrgan_onnx",
            "applied": True,
            "model_path": model_path,
        }
    except Exception as exc:
        return img_bgr, {
            "super_resolution_attempted": True,
            "method": "realesrgan_onnx",
            "applied": False,
            "reason": str(exc),
        }


def clean_document_for_ocr(img_bgr: np.ndarray) -> tuple[np.ndarray, list[dict], dict]:
    steps: dict[str, Any] = {"steps": []}
    metrics = [image_metrics(img_bgr, "original")]

    if img_bgr.shape[0] > img_bgr.shape[1] * 1.1:
        oriented = cv2.rotate(img_bgr, cv2.ROTATE_90_CLOCKWISE)
        orientation_info = {
            "orientation_applied": True,
            "method": "rotate_90_clockwise",
            "reason": "portrait_capture_landscape_document",
        }
    else:
        oriented = img_bgr
        orientation_info = {
            "orientation_applied": False,
            "reason": "landscape_or_square_capture",
        }

    steps["orientation"] = orientation_info
    steps["steps"].append("orientation")
    metrics.append(image_metrics(oriented, "orientation"))

    if os.environ.get("OCR_ENABLE_PERSPECTIVE", "false").lower() in {"1", "true", "yes"}:
        warped, perspective_info = warp_document_perspective(oriented)
    else:
        warped = oriented
        perspective_info = {
            "perspective_applied": False,
            "reason": "disabled_for_current_ocr_test",
        }
    steps["perspective"] = perspective_info
    steps["steps"].append("perspective")
    metrics.append(image_metrics(warped, "perspective"))

    deskewed, deskew_info = deskew_image(warped)
    steps["deskew"] = deskew_info
    steps["steps"].append("deskew")
    metrics.append(image_metrics(deskewed, "deskew"))

    super_resolved, sr_info = maybe_super_resolve(deskewed, metrics[-1])
    steps["super_resolution"] = sr_info
    if sr_info.get("super_resolution_attempted"):
        steps["steps"].append("super_resolution")
        metrics.append(image_metrics(super_resolved, "super_resolution"))

    thresholded = adaptive_threshold_for_ocr(super_resolved)
    steps["adaptive_threshold"] = {
        "adaptive_threshold_applied": True,
        "method": "cv2.ADAPTIVE_THRESH_GAUSSIAN_C",
        "block_size": 35,
        "c": 11,
    }
    steps["steps"].append("adaptive_threshold")
    metrics.append(image_metrics(thresholded, "adaptive_threshold"))

    ocr_ready = cv2.cvtColor(thresholded, cv2.COLOR_GRAY2BGR)
    return ocr_ready, metrics, steps


def get_paddle_ocr():
    global _paddle_ocr, _paddle_ocr_config
    det_dir = os.environ.get("PADDLEOCR_DET_MODEL_DIR")
    rec_dir = os.environ.get("PADDLEOCR_REC_MODEL_DIR")
    default_det_dir = MODELS_DIR / "paddleocr" / "PP-OCRv5_mobile_det"
    default_rec_name = os.environ.get("PADDLEOCR_REC_MODEL", "latin_PP-OCRv5_mobile_rec")
    default_rec_dir = MODELS_DIR / "paddleocr" / default_rec_name
    if det_dir is None and (default_det_dir / "inference.pdiparams").exists():
        det_dir = str(default_det_dir)
    if rec_dir is None and (default_rec_dir / "inference.pdiparams").exists():
        rec_dir = str(default_rec_dir)

    det_model = os.environ.get("PADDLEOCR_DET_MODEL", "PP-OCRv5_mobile_det")
    rec_model = os.environ.get("PADDLEOCR_REC_MODEL", default_rec_name)
    config = (det_dir, rec_dir, det_model, rec_model)

    if _paddle_ocr is None or _paddle_ocr_config != config:
        try:
            from paddleocr import PaddleOCR
        except Exception as exc:
            raise RuntimeError(f"PaddleOCR indisponible: {exc}") from exc

        logger.info("Initialisation PaddleOCR det=%s rec=%s", det_model, rec_model)
        _paddle_ocr = PaddleOCR(
            lang=os.environ.get("PADDLEOCR_LANG", "fr"),
            text_detection_model_name=det_model,
            text_detection_model_dir=det_dir,
            text_recognition_model_name=rec_model,
            text_recognition_model_dir=rec_dir,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
        _paddle_ocr_config = config
    return _paddle_ocr


def normalize_paddle_result(raw_result: Any) -> tuple[str, float, list[dict]]:
    lines: list[dict] = []

    def as_sequence(value: Any) -> list:
        if value is None:
            return []
        if isinstance(value, np.ndarray):
            return value.tolist()
        return list(value) if isinstance(value, (list, tuple)) else []

    def append_line(text: str, score: float, box: Any):
        if not text:
            return
        if isinstance(box, np.ndarray):
            box = box.tolist()
        lines.append({
            "text": str(text).strip(),
            "confidence": round(float(score) * 100 if score <= 1 else float(score), 3),
            "box": box,
        })

    for page in raw_result or []:
        if isinstance(page, dict):
            data = page.get("res", page)
        elif hasattr(page, "json"):
            data = getattr(page, "json")
            if callable(data):
                data = data()
            data = data.get("res", data) if isinstance(data, dict) else {}
        else:
            data = page

        if isinstance(data, dict) and "rec_texts" in data:
            texts = as_sequence(data.get("rec_texts"))
            scores = as_sequence(data.get("rec_scores"))
            boxes = as_sequence(data.get("rec_boxes"))
            if not boxes:
                boxes = as_sequence(data.get("rec_polys"))
            if not boxes:
                boxes = as_sequence(data.get("dt_polys"))
            for index, text in enumerate(texts):
                score = scores[index] if index < len(scores) else 0
                box = boxes[index] if index < len(boxes) else None
                append_line(text, score, box)
        elif isinstance(data, list):
            for item in data:
                if isinstance(item, list) and len(item) >= 2:
                    box = item[0]
                    rec = item[1]
                    if isinstance(rec, (list, tuple)) and len(rec) >= 2:
                        append_line(rec[0], rec[1], box)

    text = "\n".join(line["text"] for line in lines)
    confidence = float(np.mean([line["confidence"] for line in lines])) if lines else 0.0
    return text, round(confidence, 3), lines


def line_to_word_boxes(line: dict) -> list[dict]:
    text = line["text"]
    words = [w for w in text.split() if w]
    if not words:
        return []

    box = line.get("box")
    if box is None:
        return [
            {"text": word, "left": 0, "top": 0, "width": 0, "height": 0, "conf": line["confidence"]}
            for word in words
        ]

    arr = np.array(box, dtype=np.float32)
    if arr.ndim == 1 and arr.size >= 4:
        left, top, right, bottom = arr[:4]
    else:
        arr = arr.reshape(-1, 2)
        left, top = arr.min(axis=0)
        right, bottom = arr.max(axis=0)

    total_chars = max(sum(len(word) for word in words), 1)
    cursor = float(left)
    available_width = float(right - left)
    gap = available_width * 0.02 / max(len(words) - 1, 1)
    result = []
    for word in words:
        width = max(1.0, available_width * (len(word) / total_chars) - gap)
        result.append({
            "text": word,
            "left": int(round(cursor)),
            "top": int(round(top)),
            "width": int(round(width)),
            "height": int(round(bottom - top)),
            "conf": line["confidence"],
        })
        cursor += width + gap
    return result


def run_paddle_ocr_on_image(img_bgr: np.ndarray) -> tuple[str, float, list[dict]]:
    # PaddleOCR v3 accepte un chemin fichier plus robustement qu'un ndarray dans tous les modes.
    with tempfile.NamedTemporaryFile(suffix=".png", delete=True) as tmp:
        cv2.imwrite(tmp.name, img_bgr)
        raw = get_paddle_ocr().predict(tmp.name)
    return normalize_paddle_result(raw)


def rotate_for_ocr(img_bgr: np.ndarray, rotation: str) -> np.ndarray:
    if rotation == "rot90_clockwise":
        return cv2.rotate(img_bgr, cv2.ROTATE_90_CLOCKWISE)
    if rotation == "rot90_counterclockwise":
        return cv2.rotate(img_bgr, cv2.ROTATE_90_COUNTERCLOCKWISE)
    if rotation == "rot180":
        return cv2.rotate(img_bgr, cv2.ROTATE_180)
    return img_bgr


def score_burundi_ocr_candidate(text: str, confidence: float, side: str) -> tuple[float, list[str]]:
    upper = text.upper()
    found = [anchor for anchor in OCR_ANCHORS if anchor in upper]
    score = confidence + sum(OCR_ANCHORS[anchor] for anchor in found)
    normalized_side = side.lower()
    if normalized_side == "front":
        for anchor in ("IZINA", "AMATAZIRANO", "YAVUKIYE", "IGIKUMU"):
            if anchor in found:
                score += 120
    elif normalized_side == "back":
        for anchor in ("MIFPDI", "ITANGIWE", "UWUYITANZE", "REPUBLIQUE", "BURUNDI"):
            if anchor in found:
                score += 220
    return round(score, 3), found


def build_ocr_candidate(img_bgr: np.ndarray, rotation: str) -> tuple[np.ndarray, dict, list[dict]]:
    rotated = rotate_for_ocr(img_bgr, rotation)
    cleanup: dict[str, Any] = {
        "steps": ["orientation"],
        "orientation": {
            "orientation_applied": rotation != "rot0_original",
            "method": rotation,
            "reason": "orientation_candidate_scored_by_paddleocr",
        },
    }
    metrics = [image_metrics(rotated, f"{rotation}:orientation")]

    if os.environ.get("OCR_ENABLE_PERSPECTIVE", "false").lower() in {"1", "true", "yes"}:
        processed, perspective_info = warp_document_perspective(rotated)
    else:
        processed = rotated
        perspective_info = {
            "perspective_applied": False,
            "reason": "disabled_for_current_ocr_test",
        }
    cleanup["perspective"] = perspective_info
    cleanup["steps"].append("perspective")
    metrics.append(image_metrics(processed, f"{rotation}:perspective"))

    super_resolved, sr_info = maybe_super_resolve(processed, metrics[-1])
    cleanup["super_resolution"] = sr_info
    if sr_info.get("super_resolution_attempted"):
        cleanup["steps"].append("super_resolution")
        metrics.append(image_metrics(super_resolved, f"{rotation}:super_resolution"))
    processed = super_resolved

    cleanup["adaptive_threshold"] = {
        "adaptive_threshold_applied": False,
        "reason": "disabled_after_real_paddleocr_diagnostic_threshold_destroyed_text",
    }
    return processed, cleanup, metrics


def select_best_burundi_ocr(img_bgr: np.ndarray, side: str) -> dict:
    candidates = []
    for rotation in ("rot0_original", "rot90_counterclockwise", "rot90_clockwise", "rot180"):
        processed, cleanup, metrics = build_ocr_candidate(img_bgr, rotation)
        text, confidence, lines = run_paddle_ocr_on_image(processed)
        score, anchors = score_burundi_ocr_candidate(text, confidence, side)
        words = []
        for line in lines:
            words.extend(line_to_word_boxes(line))
        candidates.append({
            "rotation": rotation,
            "score": score,
            "anchorsFound": anchors,
            "confidence": confidence,
            "line_count": len(lines),
            "word_count": len(words),
            "text": text,
            "lines": lines,
            "words": words,
            "cleanup": cleanup,
            "metrics": metrics,
        })

    candidates.sort(key=lambda item: item["score"], reverse=True)
    best = candidates[0]
    best["orientationCandidates"] = [
        {
            "rotation": item["rotation"],
            "score": item["score"],
            "confidence": item["confidence"],
            "anchorsFound": item["anchorsFound"],
            "line_count": item["line_count"],
            "word_count": item["word_count"],
        }
        for item in candidates
    ]
    return best


def crop_fraction(img_bgr: np.ndarray, x: float, y: float, w: float, h: float) -> np.ndarray:
    height, width = img_bgr.shape[:2]
    sx = max(0, min(width - 1, int(width * x)))
    sy = max(0, min(height - 1, int(height * y)))
    ex = max(sx + 1, min(width, int(width * (x + w))))
    ey = max(sy + 1, min(height, int(height * (y + h))))
    return img_bgr[sy:ey, sx:ex]


def run_fast_burundi_candidate_ocr(img_bgr: np.ndarray, side: str, source: str) -> dict:
    max_dim = max(img_bgr.shape[:2])
    if max_dim > 1500:
      scale = 1500.0 / max_dim
      work = cv2.resize(img_bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    else:
      work = img_bgr
    processed, cleanup, metrics = build_ocr_candidate(work, f"{source}:rot0_original")
    text, confidence, lines = run_paddle_ocr_on_image(processed)
    score, anchors = score_burundi_ocr_candidate(text, confidence, side)
    words = []
    for line in lines:
        words.extend(line_to_word_boxes(line))
    return {
        "rotation": "rot0_original",
        "source": source,
        "score": score,
        "anchorsFound": anchors,
        "confidence": confidence,
        "line_count": len(lines),
        "word_count": len(words),
        "text": text,
        "lines": lines,
        "words": words,
        "cleanup": cleanup,
        "metrics": metrics,
    }


def select_fast_burundi_candidate_ocr(img_bgr: np.ndarray, side: str) -> dict:
    """
    Version rapide pour auto-capture live.
    L'image live peut contenir beaucoup de décor autour du cadre de scan.
    On teste donc l'image reçue et plusieurs crops centrés correspondant au
    cadre vert de l'UI, puis on garde le meilleur score OCR.
    """
    candidate_images = [
        ("full_frame", img_bgr),
        ("scan_frame_center", crop_fraction(img_bgr, 0.08, 0.14, 0.84, 0.68)),
        ("scan_frame_tall", crop_fraction(img_bgr, 0.06, 0.10, 0.88, 0.78)),
        ("scan_frame_inner", crop_fraction(img_bgr, 0.14, 0.20, 0.72, 0.60)),
    ]
    candidates = [
        run_fast_burundi_candidate_ocr(candidate, side, source)
        for source, candidate in candidate_images
    ]
    candidates.sort(
        key=lambda item: (
            item["score"],
            len(item["anchorsFound"]),
            item["confidence"],
            item["line_count"],
        ),
        reverse=True,
    )
    best = candidates[0]
    best["cropCandidates"] = [
        {
            "source": item["source"],
            "score": item["score"],
            "confidence": item["confidence"],
            "anchorsFound": item["anchorsFound"],
            "line_count": item["line_count"],
            "word_count": item["word_count"],
        }
        for item in candidates
    ]
    return best

# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {"status": "ok", "service": "kyc-vision"}


@app.post("/detect-face")
async def detect_face(image: UploadFile = File(...)):
    """
    Détecte le visage principal dans une image.
    Utilise cv2.FaceDetectorYN_create (wrapper C++ OpenCV pour YuNet).

    Retourne:
    - detected: bool
    - box: {x, y, width, height} en pixels absolus
    - landmarks: liste de 5 points [{x, y}]
    - confidence: float 0-1
    """
    try:
        image_bytes = await image.read()
        img = decode_image(image_bytes)
        img_h, img_w = img.shape[:2]

        # Créer le détecteur adapté à la taille de l'image
        detector = create_yunet_detector(img_w, img_h)

        # Détection
        _, faces = detector.detect(img)

        if faces is None or len(faces) == 0:
            logger.info("Aucun visage détecté")
            return JSONResponse({
                "detected": False,
                "box": None,
                "landmarks": None,
                "confidence": 0.0,
            })

        # Prendre le visage le plus confiant (top_k=1 déjà filtré)
        face = faces[0]

        # YuNet retourne: [x, y, w, h, lm0x, lm0y, ..., lm4x, lm4y, score]
        fx, fy, fw, fh = int(face[0]), int(face[1]), int(face[2]), int(face[3])
        score = float(face[14])

        # 5 landmarks (œil gauche, œil droit, nez, coin gauche bouche, coin droit bouche)
        landmarks = []
        for i in range(5):
            lx = float(face[4 + i * 2])
            ly = float(face[4 + i * 2 + 1])
            landmarks.append({"x": lx, "y": ly})

        logger.info(f"Visage détecté: box=({fx},{fy},{fw},{fh}) score={score:.3f}")

        return JSONResponse({
            "detected": True,
            "box": {"x": fx, "y": fy, "width": fw, "height": fh},
            "landmarks": landmarks,
            "confidence": round(score, 4),
        })

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Erreur inattendue dans /detect-face")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# LIVENESS ACTIF — VÉRIFICATION SERVEUR DES DÉFIS DE MOUVEMENT
# ═══════════════════════════════════════════════════════════════════════════════

# Seuils calibrables par variable d'environnement
HEAD_TURN_MIN_DEGREES = float(os.environ.get("LIVENESS_HEAD_TURN_MIN_DEGREES", "15"))
MOUTH_MIN_MAR_VARIATION = float(os.environ.get("LIVENESS_MOUTH_MIN_MAR_VARIATION", "0.08"))
EYE_BLINK_MIN_EAR_DROP = float(os.environ.get("LIVENESS_EYE_BLINK_MIN_EAR_DROP", "0.06"))
EYE_BLINK_MIN_DROP_RATIO = float(os.environ.get("LIVENESS_EYE_BLINK_MIN_DROP_RATIO", "0.20"))
MIN_FACE_PRESENCE_RATIO = float(os.environ.get("LIVENESS_MIN_FACE_RATIO", "0.7"))


def _landmark_point(landmarks: Any, idx: int, width: int, height: int) -> tuple[float, float]:
    lm = landmarks[idx]
    return float(lm.x * width), float(lm.y * height)


def _eye_aspect_ratio(landmarks: Any, width: int, height: int, indices: list[int]) -> float:
    p1, p2, p3, p4, p5, p6 = [_landmark_point(landmarks, idx, width, height) for idx in indices]
    horizontal = math.dist(p1, p4)
    if horizontal <= 1e-6:
        return 0.0
    return float((math.dist(p2, p6) + math.dist(p3, p5)) / (2.0 * horizontal))


def _mouth_aspect_ratio(landmarks: Any, width: int, height: int) -> float:
    left = _landmark_point(landmarks, 78, width, height)
    right = _landmark_point(landmarks, 308, width, height)
    upper = _landmark_point(landmarks, 13, width, height)
    lower = _landmark_point(landmarks, 14, width, height)
    horizontal = math.dist(left, right)
    if horizontal <= 1e-6:
        return 0.0
    return float(math.dist(upper, lower) / horizontal)


def _estimate_yaw_degrees(landmarks: Any, width: int, height: int) -> Optional[float]:
    image_points = np.array(
        [
            _landmark_point(landmarks, 1, width, height),    # nose tip
            _landmark_point(landmarks, 152, width, height),  # chin
            _landmark_point(landmarks, 33, width, height),   # left eye outer
            _landmark_point(landmarks, 263, width, height),  # right eye outer
            _landmark_point(landmarks, 61, width, height),   # mouth left
            _landmark_point(landmarks, 291, width, height),  # mouth right
        ],
        dtype=np.float64,
    )
    model_points = np.array(
        [
            (0.0, 0.0, 0.0),
            (0.0, -63.6, -12.5),
            (-43.3, 32.7, -26.0),
            (43.3, 32.7, -26.0),
            (-28.9, -28.9, -24.1),
            (28.9, -28.9, -24.1),
        ],
        dtype=np.float64,
    )
    focal_length = float(width)
    camera_matrix = np.array(
        [[focal_length, 0.0, width / 2.0], [0.0, focal_length, height / 2.0], [0.0, 0.0, 1.0]],
        dtype=np.float64,
    )
    dist_coeffs = np.zeros((4, 1), dtype=np.float64)
    success, rotation_vector, _ = cv2.solvePnP(
        model_points,
        image_points,
        camera_matrix,
        dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE,
    )
    if not success:
        return None
    rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
    return float(math.degrees(math.atan2(rotation_matrix[0, 2], rotation_matrix[2, 2])))


def _max_drop_then_recovery(series: list[float]) -> tuple[float, float]:
    if len(series) < 3:
        return 0.0, 0.0
    max_drop = 0.0
    baseline = max(series)
    for idx, value in enumerate(series):
        before = max(series[: idx + 1])
        after = max(series[idx:])
        drop = min(before, after) - value
        max_drop = max(max_drop, drop)
    drop_ratio = max_drop / baseline if baseline > 1e-6 else 0.0
    return float(max_drop), float(drop_ratio)


def _angular_range_degrees(series: list[float]) -> float:
    """
    Retourne l'amplitude circulaire minimale d'une série d'angles.
    Exemple: 179° → -179° vaut 2°, pas 358°.
    """
    if len(series) < 2:
        return 0.0
    normalized = sorted((angle % 360.0 + 360.0) % 360.0 for angle in series)
    gaps = [
        normalized[index + 1] - normalized[index]
        for index in range(len(normalized) - 1)
    ]
    gaps.append((normalized[0] + 360.0) - normalized[-1])
    return float(360.0 - max(gaps))


async def _analyze_active_liveness_frames(
    frames: list[UploadFile],
    *,
    min_frames: int = 15,
    max_frames: int = 30,
    min_signal_frames: int = 10,
) -> dict:
    started = time.time()
    if len(frames) < min_frames:
        raise HTTPException(
            status_code=400,
            detail=f"Au moins {min_frames} frames requises pour le liveness actif serveur (reçu: {len(frames)})",
        )
    if len(frames) > max_frames:
        raise HTTPException(status_code=400, detail=f"Maximum {max_frames} frames")

    face_mesh = get_mediapipe_face_mesh()
    ear_series: list[float] = []
    mar_series: list[float] = []
    yaw_series: list[float] = []
    frames_with_face = 0

    for upload in frames:
        image_bytes = await upload.read()
        try:
            img_bgr = decode_image(image_bytes)
        except ValueError:
            continue
        img_h, img_w = img_bgr.shape[:2]
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        result = face_mesh.process(img_rgb)
        if not result.multi_face_landmarks:
            continue
        landmarks = result.multi_face_landmarks[0].landmark
        frames_with_face += 1

        left_ear = _eye_aspect_ratio(landmarks, img_w, img_h, [33, 160, 158, 133, 153, 144])
        right_ear = _eye_aspect_ratio(landmarks, img_w, img_h, [362, 385, 387, 263, 373, 380])
        ear_series.append(float((left_ear + right_ear) / 2.0))
        mar_series.append(_mouth_aspect_ratio(landmarks, img_w, img_h))
        yaw = _estimate_yaw_degrees(landmarks, img_w, img_h)
        if yaw is not None and math.isfinite(yaw):
            yaw_series.append(yaw)

    total = len(frames)
    presence_ratio = frames_with_face / total if total else 0.0

    max_ear_drop, ear_drop_ratio = _max_drop_then_recovery(ear_series)
    max_yaw_change = _angular_range_degrees(yaw_series)
    max_mar_variation = (max(mar_series) - min(mar_series)) if mar_series else 0.0

    enough_face = presence_ratio >= MIN_FACE_PRESENCE_RATIO and len(ear_series) >= min_signal_frames
    blink_detected = (
        enough_face
        and max_ear_drop >= EYE_BLINK_MIN_EAR_DROP
        and ear_drop_ratio >= EYE_BLINK_MIN_DROP_RATIO
    )
    head_turn_detected = enough_face and max_yaw_change >= HEAD_TURN_MIN_DEGREES
    mouth_movement_detected = enough_face and max_mar_variation >= MOUTH_MIN_MAR_VARIATION

    reason = None
    if not enough_face:
        reason = (
            f"Visage présent dans {frames_with_face}/{total} frames "
            f"(minimum requis: {MIN_FACE_PRESENCE_RATIO:.0%})"
        )

    payload = {
        "blinkDetected": bool(blink_detected),
        "headTurnDetected": bool(head_turn_detected),
        "mouthMovementDetected": bool(mouth_movement_detected),
        "eye_blink": bool(blink_detected),
        "head_turn": bool(head_turn_detected),
        "mouth_movement": bool(mouth_movement_detected),
        "framesTotal": total,
        "framesWithFace": frames_with_face,
        "frames_total": total,
        "frames_with_face": frames_with_face,
        "maxEarDrop": round(max_ear_drop, 4),
        "earDropRatio": round(ear_drop_ratio, 4),
        "maxYawChangeDegrees": round(max_yaw_change, 2),
        "maxMarVariation": round(max_mar_variation, 4),
        "measures": {
            "maxEarDrop": round(max_ear_drop, 4),
            "earDropRatio": round(ear_drop_ratio, 4),
            "maxYawChangeDegrees": round(max_yaw_change, 2),
            "maxMarVariation": round(max_mar_variation, 4),
        },
        "thresholds": {
            "minFrames": min_frames,
            "maxFrames": max_frames,
            "minFacePresenceRatio": MIN_FACE_PRESENCE_RATIO,
            "minEarDrop": EYE_BLINK_MIN_EAR_DROP,
            "minEarDropRatio": EYE_BLINK_MIN_DROP_RATIO,
            "minYawChangeDegrees": HEAD_TURN_MIN_DEGREES,
            "minMarVariation": MOUTH_MIN_MAR_VARIATION,
        },
        "series": {
            "ear": [round(v, 4) for v in ear_series],
            "yawDegrees": [round(v, 2) for v in yaw_series],
            "mar": [round(v, 4) for v in mar_series],
        },
        "reason": reason,
        "elapsedMs": round((time.time() - started) * 1000, 1),
        "elapsed_ms": round((time.time() - started) * 1000, 1),
    }

    logger.info(
        "Liveness actif MediaPipe: frames=%d/%d ear_drop=%.4f yaw=%.2f° mar=%.4f "
        "→ blink=%s head=%s mouth=%s",
        frames_with_face,
        total,
        max_ear_drop,
        max_yaw_change,
        max_mar_variation,
        blink_detected,
        head_turn_detected,
        mouth_movement_detected,
    )
    return payload


@app.post("/verify-active-liveness")
async def verify_active_liveness(frames: list[UploadFile] = File(...)):
    """
    Vérifie les défis de liveness actif avec MediaPipe FaceMesh sur une rafale
    de 15-30 frames. Le serveur calcule EAR, yaw solvePnP et MAR ; aucun booléen
    déclaré par le client n'est accepté.
    """
    try:
        return JSONResponse(await _analyze_active_liveness_frames(frames))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/verify-active-liveness-segment")
async def verify_active_liveness_segment(
    expectedChallenge: str = Form(...),
    frames: list[UploadFile] = File(...),
):
    """
    Vérifie un segment court dédié à un seul geste attendu.
    expectedChallenge: blink | head_turn | mouth
    """
    normalized = expectedChallenge.strip().lower().replace("-", "_")
    aliases = {
        "blink": "blink",
        "eye_blink": "blink",
        "turn": "head_turn",
        "head": "head_turn",
        "head_turn": "head_turn",
        "mouth": "mouth",
        "mouth_movement": "mouth",
    }
    challenge = aliases.get(normalized)
    if challenge is None:
        raise HTTPException(status_code=400, detail=f"Défi inconnu: {expectedChallenge}")

    try:
        payload = await _analyze_active_liveness_frames(
            frames,
            min_frames=5,
            max_frames=8,
            min_signal_frames=3,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    passed_by_challenge = {
        "blink": payload["blinkDetected"],
        "head_turn": payload["headTurnDetected"],
        "mouth": payload["mouthMovementDetected"],
    }
    payload["expectedChallenge"] = challenge
    payload["passed"] = bool(passed_by_challenge[challenge])
    payload["source"] = "server_verified_segment"
    return JSONResponse(payload)


@app.post("/anti-spoofing")
async def anti_spoofing(image: UploadFile = File(...)):
    """
    Vérifie si l'image d'un visage est réelle ou une attaque (impression/replay).
    Utilise MiniFASNetV2 (Apache 2.0).

    L'image reçue peut être le selfie complet — ce endpoint détecte d'abord le visage
    puis applique l'anti-spoofing sur le recadrage avec marge.

    Retourne:
    - is_real_face: bool
    - score: float 0-1 (probabilité d'être un vrai visage)
    - prob_print_attack: float
    - prob_replay_attack: float
    """
    try:
        image_bytes = await image.read()
        img_bgr = decode_image(image_bytes)
        img_h, img_w = img_bgr.shape[:2]

        # 1. Détecter le visage avec YuNet
        detector = create_yunet_detector(img_w, img_h)
        _, faces = detector.detect(img_bgr)

        if faces is None or len(faces) == 0:
            logger.warning("Aucun visage détecté pour l'anti-spoofing")
            return JSONResponse({
                "is_real_face": False,
                "score": 0.0,
                "prob_print_attack": 0.0,
                "prob_replay_attack": 0.0,
                "error": "Aucun visage détecté",
            })

        face = faces[0]
        fx, fy, fw, fh = int(face[0]), int(face[1]), int(face[2]), int(face[3])

        predictor = get_minivision_predictor()
        prediction = np.zeros((1, 3), dtype=np.float32)

        for model_path in MINIVISION_MODEL_PATHS:
            height, width, scale = parse_minivision_model_name(model_path)
            face_crop = crop_face_with_margin(img_bgr, fx, fy, fw, fh, scale)
            if face_crop.size == 0:
                raise ValueError("Recadrage du visage vide")
            face_resized = cv2.resize(face_crop, (width, height))
            prediction += predictor.predict(face_resized, str(model_path))

        probs = prediction / len(MINIVISION_MODEL_PATHS)

        # Source officielle Minivision: un visage réel correspond au label 1.
        prob_print = float(probs[0][0])
        prob_live = float(probs[0][1])
        prob_replay = float(probs[0][2])

        is_real = prob_live >= ANTISPOOFING_REAL_THRESHOLD

        logger.info(f"Anti-spoofing: live={prob_live:.4f} print={prob_print:.4f} replay={prob_replay:.4f} → {'REAL' if is_real else 'FAKE'}")

        return JSONResponse({
            "is_real_face": is_real,
            "score": round(prob_live, 4),
            "prob_print_attack": round(prob_print, 4),
            "prob_replay_attack": round(prob_replay, 4),
        })

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Erreur inattendue dans /anti-spoofing")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/face-match")
async def face_match(
    card_image: UploadFile = File(...),
    selfie_image: UploadFile = File(...),
):
    """
    Compare deux visages avec le pipeline officiel OpenCV SFace:
    YuNet -> FaceRecognizerSF.alignCrop -> feature -> FR_COSINE.

    Seuil cosine officiel OpenCV Zoo SFace: 0.363.
    """
    try:
        card_bgr = decode_image(await card_image.read())
        selfie_bgr = decode_image(await selfie_image.read())

        recognizer = get_sface_recognizer()
        card_candidates = []
        selfie_candidates = []

        for rotation, candidate_img in image_rotation_candidates(card_bgr):
            face = detect_primary_face(candidate_img)
            if face is not None:
                card_candidates.append({
                    "rotation": rotation,
                    "image": candidate_img,
                    "face": face,
                    "feature": extract_sface_feature(candidate_img, face),
                })

        for rotation, candidate_img in image_rotation_candidates(selfie_bgr):
            face = detect_primary_face(candidate_img)
            if face is not None:
                selfie_candidates.append({
                    "rotation": rotation,
                    "image": candidate_img,
                    "face": face,
                    "feature": extract_sface_feature(candidate_img, face),
                })

        if not card_candidates:
            return JSONResponse({
                "matched": False,
                "similarity": 0.0,
                "threshold": SFACE_COSINE_THRESHOLD,
                "distance": 1.0,
                "method": "sface_opencv",
                "error": "Aucun visage détecté sur le document",
            })
        if not selfie_candidates:
            return JSONResponse({
                "matched": False,
                "similarity": 0.0,
                "threshold": SFACE_COSINE_THRESHOLD,
                "distance": 1.0,
                "method": "sface_opencv",
                "error": "Aucun visage détecté sur le selfie",
            })

        best = None
        for card_candidate in card_candidates:
            for selfie_candidate in selfie_candidates:
                similarity = float(recognizer.match(
                    card_candidate["feature"],
                    selfie_candidate["feature"],
                    cv2.FaceRecognizerSF_FR_COSINE,
                ))
                if best is None or similarity > best["similarity"]:
                    best = {
                        "similarity": similarity,
                        "card": card_candidate,
                        "selfie": selfie_candidate,
                    }

        similarity = float(best["similarity"])
        card_face = best["card"]["face"]
        selfie_face = best["selfie"]["face"]
        matched = similarity >= SFACE_COSINE_THRESHOLD

        return JSONResponse({
            "matched": matched,
            "similarity": round(similarity, 4),
            "threshold": SFACE_COSINE_THRESHOLD,
            "distance": round(1 - similarity, 4),
            "method": "sface_opencv",
            "card_rotation": best["card"]["rotation"],
            "selfie_rotation": best["selfie"]["rotation"],
            "card_face": {
                "x": int(card_face[0]),
                "y": int(card_face[1]),
                "width": int(card_face[2]),
                "height": int(card_face[3]),
                "confidence": round(float(card_face[-1]), 4),
            },
            "selfie_face": {
                "x": int(selfie_face[0]),
                "y": int(selfie_face[1]),
                "width": int(selfie_face[2]),
                "height": int(selfie_face[3]),
                "confidence": round(float(selfie_face[-1]), 4),
            },
        })

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Erreur inattendue dans /face-match")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/face-embedding")
async def face_embedding(image: UploadFile = File(...)):
    """
    Extrait l'embedding SFace du visage principal d'une image live.
    Utilisé côté backend pour l'anti-doublon biométrique inter-comptes.
    """
    try:
        img_bgr = decode_image(await image.read())
        best = None
        for rotation, candidate_img in image_rotation_candidates(img_bgr):
            face = detect_primary_face(candidate_img)
            if face is None:
                continue
            feature = extract_sface_feature(candidate_img, face).reshape(-1)
            candidate = {
                "rotation": rotation,
                "face": face,
                "feature": feature,
                "confidence": float(face[-1]),
            }
            if best is None or candidate["confidence"] > best["confidence"]:
                best = candidate

        if best is None:
            return JSONResponse({
                "detected": False,
                "embedding": [],
                "method": "sface_opencv",
                "error": "Aucun visage détecté",
            })

        face = best["face"]
        return JSONResponse({
            "detected": True,
            "embedding": [round(float(value), 6) for value in best["feature"].tolist()],
            "method": "sface_opencv",
            "rotation": best["rotation"],
            "face": {
                "x": int(face[0]),
                "y": int(face[1]),
                "width": int(face[2]),
                "height": int(face[3]),
                "confidence": round(float(face[-1]), 4),
            },
        })
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Erreur inattendue dans /face-embedding")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ocr-burundi")
async def ocr_burundi(
    image: UploadFile = File(...),
    side: str = Form("unknown"),
):
    """
    OCR robuste pour documents burundais.

    Pipeline réel:
    1. Correction perspective par quadrilatère document
    2. Redressement deskew
    3. Super-résolution si netteté faible (Real-ESRGAN ONNX si configuré, sinon fallback bicubic+unsharp)
    4. Seuillage adaptatif local
    5. PaddleOCR lang=fr
    """
    started_at = time.perf_counter()
    try:
        image_bytes = await image.read()
        img_bgr = decode_image(image_bytes)

        best = select_best_burundi_ocr(img_bgr, side)
        text = best["text"]
        confidence = best["confidence"]
        lines = best["lines"]
        words = best["words"]

        logger.info(
            "OCR Burundi side=%s lines=%d words=%d confidence=%.2f elapsed=%.2fs",
            side,
            len(lines),
            len(words),
            confidence,
            time.perf_counter() - started_at,
        )

        return JSONResponse({
            "side": side,
            "text": text,
            "confidence": confidence,
            "lines": lines,
            "words": words,
            "cleanup": best["cleanup"],
            "metrics": best["metrics"],
            "selectedOrientation": best["rotation"],
            "orientationCandidates": best["orientationCandidates"],
            "anchorsFound": best["anchorsFound"],
            "elapsed_ms": round((time.perf_counter() - started_at) * 1000, 2),
        })

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Erreur inattendue dans /ocr-burundi")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/document-candidate-burundi")
async def document_candidate_burundi(
    image: UploadFile = File(...),
    side: str = Form("unknown"),
):
    """
    Validation rapide d'une image candidate avant auto-capture KYC.
    Ce n'est pas un simple contrôle de bords: on exige les ancres réelles du
    template burundais selon le côté attendu.
    """
    started_at = time.perf_counter()
    try:
        img_bgr = decode_image(await image.read())
        best = select_fast_burundi_candidate_ocr(img_bgr, side)
        anchors = best["anchorsFound"]
        upper_anchors = set(anchors)
        normalized_side = side.lower()

        front_identity = {"IZINA", "AMATAZIRANO", "SE", "NYINA"}
        front_location = {"PROVENSI", "KOMINE", "YAVUKIYE", "ITALIKI", "UMUSOZI"}
        back_official = {"MIFPDI", "ITANGIWE", "UWUYITANZE"}
        back_republic = {"REPUBLIQUE", "BURUNDI"}

        if normalized_side == "front":
            identity_hits = len(front_identity.intersection(upper_anchors))
            location_hits = len(front_location.intersection(upper_anchors))
            has_identity_title = "IZINA" in upper_anchors
            has_fingerprint_zone = "IGIKUMU" in upper_anchors
            # Empêche la validation d'un petit zoom sur une seule zone texte:
            # le recto complet doit montrer identité + localisation/date + zone empreinte.
            # UMUSOZI est un bonus utile mais pas obligatoire: sur mobile réel cette
            # zone est souvent petite/floue alors que le document est bien complet.
            is_valid = (
                has_identity_title
                and identity_hits >= 3
                and location_hits >= 3
                and has_fingerprint_zone
                and len(upper_anchors) >= 8
            )
            reason = "recto_burundi_anchors_ok" if is_valid else "recto_anchors_missing"
        elif normalized_side == "back":
            official_hits = len(back_official.intersection(upper_anchors))
            republic_hits = len(back_republic.intersection(upper_anchors))
            has_mifpdi_pattern = bool(__import__("re").search(r"\d{3,5}/\d{2,4}[.]\d{2,4}/\d{4}", best["text"]))
            # Le verso complet doit porter l'émission officielle ET l'en-tête République/Burundi.
            is_valid = (
                (official_hits >= 1 or has_mifpdi_pattern)
                and republic_hits >= 1
                and len(upper_anchors) >= 4
            )
            reason = "verso_burundi_anchors_ok" if is_valid else "verso_anchors_missing"
        else:
            is_valid = len(upper_anchors) >= 3
            reason = "burundi_anchors_ok" if is_valid else "burundi_anchors_missing"

        metrics = best["metrics"][0] if best["metrics"] else {}
        quality_ok = (
            float(metrics.get("sharpness_laplacian_var", 0)) >= 35
            and 35 <= float(metrics.get("mean_luma", 0)) <= 225
        )
        if is_valid and not quality_ok:
            reason = "document_detected_but_quality_low"

        return JSONResponse({
            "side": normalized_side,
            "isValid": bool(is_valid and quality_ok),
            "reason": reason,
            "anchorsFound": anchors,
            "confidence": best["confidence"],
            "selectedOrientation": best["rotation"],
            "selectedSource": best.get("source"),
            "cropCandidates": best.get("cropCandidates", []),
            "lineCount": best["line_count"],
            "wordCount": best["word_count"],
            "qualityOk": bool(quality_ok),
            "metrics": metrics,
            "elapsed_ms": round((time.perf_counter() - started_at) * 1000, 2),
            "textPreview": best["text"][:260],
        })
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Erreur inattendue dans /document-candidate-burundi")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# STAMP OCR — transformation polaire avant OCR
# ═══════════════════════════════════════════════════════════════════════════════

def detect_blue_circle(
    img_bgr: np.ndarray,
    min_radius: int = 80,
    max_radius_fraction: float = 0.17,
) -> Optional[dict]:
    """
    Détecte un cercle bleu (tampon de commune burundaise) par transformée de Hough.
    Retourne les coordonnées du cercle ou None.
    """
    img_h, img_w = img_bgr.shape[:2]
    scale = min(1.0, 1400.0 / max(img_h, img_w))
    work = cv2.resize(img_bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else img_bgr
    work_h, work_w = work.shape[:2]
    gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (9, 9), 2)

    # Détection de cercles par Hough
    min_radius_scaled = max(30, int(min_radius * scale))
    max_radius = int(min(work_h, work_w) * max_radius_fraction)
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=100,
        param1=100,
        param2=30,
        minRadius=min_radius_scaled,
        maxRadius=max_radius,
    )

    if circles is None:
        return None

    circles = np.round(circles[0, :]).astype("int")
    best = None
    best_score = -1

    for (cx, cy, r) in circles:
        orig_cx = int(round(cx / scale))
        orig_cy = int(round(cy / scale))
        orig_r = int(round(r / scale))
        if orig_r < int(min(img_h, img_w) * 0.10):
            # Évite l'empreinte digitale bleue, plus petite et très saturée.
            continue

        # Vérifier que c'est un cercle bleu
        mask = np.zeros(img_bgr.shape[:2], np.uint8)
        cv2.circle(mask, (orig_cx, orig_cy), int(orig_r * 0.8), 255, -1)
        mean_color = cv2.mean(img_bgr, mask=mask)  # BGR

        B, G, R = mean_color[0], mean_color[1], mean_color[2]
        blueness = (B - (R + G) / 2)
        if blueness < 1:
            continue

        # Le cachet officiel est le grand cercle; l'empreinte est petite mais très bleue.
        score = orig_r + blueness * 8
        if score > best_score:
            best_score = score
            best = {
                "x": orig_cx,
                "y": orig_cy,
                "radius": orig_r,
                "blueness": round(blueness, 1),
                "score": round(score, 1),
            }

    return best


def unwrap_stamp_polar(
    img_bgr: np.ndarray,
    cx: int,
    cy: int,
    radius: int,
    output_width: int = 600,
    output_height: int = 200,
) -> np.ndarray:
    """
    Déroule un tampon circulaire en bande rectangulaire via transformée polaire.

    Le tampon burundais étant circulaire, on projette l'anneau [radius*0.6, radius*0.95]
    sur une image rectangulaire pour que l'OCR standard puisse lire le texte.
    """
    # Image masquée : seul l'anneau du tampon est conservé
    mask = np.zeros(img_bgr.shape[:2], np.uint8)
    cv2.circle(mask, (cx, cy), int(radius * 0.95), 255, -1)
    cv2.circle(mask, (cx, cy), int(radius * 0.5), 0, -1)  # Enlever le centre

    masked = cv2.bitwise_and(img_bgr, img_bgr, mask=mask)

    # warpPolar: déroule le cercle en rectangle
    # dsize=(output_width, output_height) => height correspond à la circonférence
    polar = cv2.warpPolar(
        masked,
        dsize=(output_width, output_height),
        center=(cx, cy),
        maxRadius=int(radius * 1.1),
        flags=cv2.WARP_POLAR_LINEAR,
    )

    # Rotation pour que le texte soit droit
    polar = cv2.rotate(polar, cv2.ROTATE_90_CLOCKWISE)

    # Prétraitement pour OCR
    gray = cv2.cvtColor(polar, cv2.COLOR_BGR2GRAY)
    # Resize 2x pour améliorer l'OCR
    scaled = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    # Seuillage adaptatif
    bin_img = cv2.adaptiveThreshold(scaled, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10)

    return bin_img


def is_meaningful_stamp_text(text: str | None) -> bool:
    if not text:
        return False
    normalized = "".join(ch for ch in text.upper() if ch.isalpha())
    return len(normalized) >= 3


@app.post("/stamp-ocr")
async def stamp_ocr(image: UploadFile = File(...)):
    """
    Détecte le tampon circulaire, le déroule via warpPolar, puis fait l'OCR.

    Retourne:
    - detected: bool
    - stamp_center: {x, y, radius}
    - ocr_text: texte extrait du tampon (ou None si échec)
    - note: diagnostic sur la fiabilité
    """
    try:
        image_bytes = await image.read()
        img_bgr = decode_image(image_bytes)

        # 1. Détecter un cercle bleu
        stamp = detect_blue_circle(img_bgr)
        if stamp is None:
            return JSONResponse({
                "detected": False,
                "stamp_center": None,
                "ocr_text": None,
                "note": "Aucun cercle bleu détecté — vérifier la détection de zone photo d'abord (P2)",
            })

        # 2. Dérouler le tampon
        unwrapped = unwrap_stamp_polar(img_bgr, stamp["x"], stamp["y"], stamp["radius"])

        # 3. OCR PaddleOCR sur l'image déroulée
        with tempfile.NamedTemporaryFile(suffix=".png", delete=True) as tmp:
            cv2.imwrite(tmp.name, unwrapped)
            raw = get_paddle_ocr().predict(tmp.name)

        ocr_text, confidence, lines = normalize_paddle_result(raw)
        meaningful_text = ocr_text if is_meaningful_stamp_text(ocr_text) else None

        logger.info(f"Stamp OCR: center=({stamp['x']},{stamp['y']}) r={stamp['radius']} text={ocr_text[:80] if ocr_text else None}")

        return JSONResponse({
            "detected": True,
            "stamp_center": {"x": stamp["x"], "y": stamp["y"], "radius": stamp["radius"], "blueness": stamp["blueness"]},
            "ocr_text": meaningful_text,
            "raw_ocr_text": ocr_text,
            "confidence": confidence,
            "lines": lines,
            "note": "OK — texte exploitable extrait après transformation polaire" if meaningful_text else "Tampon détecté mais OCR non exploitable — signal ignoré côté cohérence",
        })

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Erreur inattendue dans /stamp-ocr")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# STARTUP
# ═══════════════════════════════════════════════════════════════════════════════

@app.on_event("startup")
async def startup_event():
    """Vérification des modèles au démarrage."""
    errors = []

    if not Path(YUNET_MODEL_PATH).exists():
        errors.append(f"YuNet manquant: {YUNET_MODEL_PATH}")
    else:
        logger.info(f"YuNet OK: {YUNET_MODEL_PATH}")

    missing_minivision = [str(path) for path in MINIVISION_MODEL_PATHS if not path.exists()]
    if missing_minivision:
        errors.append("Poids Minivision manquants: " + ", ".join(missing_minivision))
    else:
        logger.info(f"Silent-Face-Anti-Spoofing officiel OK: {MINIVISION_MODELS_DIR}")

    if not Path(SFACE_MODEL_PATH).exists():
        errors.append(f"SFace manquant: {SFACE_MODEL_PATH}")
    else:
        logger.info(f"SFace OK: {SFACE_MODEL_PATH}")

    if errors:
        logger.error("Modèles manquants: " + "; ".join(errors))
    else:
        # Pré-charger les modèles critiques
        try:
            get_minivision_predictor()
            logger.info("Modèles anti-spoofing Minivision pré-chargés avec succès")
        except Exception as e:
            logger.error(f"Échec pré-chargement anti-spoofing: {e}")
        try:
            get_sface_recognizer()
            logger.info("Modèle SFace pré-chargé avec succès")
        except Exception as e:
            logger.error(f"Échec pré-chargement SFace: {e}")
