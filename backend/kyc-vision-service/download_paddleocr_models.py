"""Download PaddleOCR weights from official PaddlePaddle Hugging Face repos.

This script is intentionally resumable and only uses the verified
`PaddlePaddle/*` organization on Hugging Face.
"""

from pathlib import Path

from huggingface_hub import hf_hub_download


MODELS = [
    ("PaddlePaddle/PP-OCRv5_mobile_det", "PP-OCRv5_mobile_det"),
    ("PaddlePaddle/latin_PP-OCRv5_mobile_rec", "latin_PP-OCRv5_mobile_rec"),
    ("PaddlePaddle/PP-OCRv5_server_rec", "PP-OCRv5_server_rec"),
]

FILES = [
    ".gitattributes",
    "README.md",
    "config.json",
    "inference.json",
    "inference.pdiparams",
    "inference.yml",
]


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1] / "models" / "paddleocr"
    base_dir.mkdir(parents=True, exist_ok=True)

    for repo_id, model_name in MODELS:
        local_dir = base_dir / model_name
        local_dir.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {repo_id} -> {local_dir}", flush=True)

        for filename in FILES:
            print(f"START {repo_id}/{filename}", flush=True)
            try:
                path = hf_hub_download(
                    repo_id=repo_id,
                    filename=filename,
                    local_dir=local_dir,
                    resume_download=True,
                )
                size = Path(path).stat().st_size
                print(f"OK {repo_id}/{filename} {size} bytes", flush=True)
            except BaseException as exc:
                print(f"ERROR {repo_id}/{filename}: {type(exc).__name__}: {exc}", flush=True)
                raise

    print("PaddleOCR official model download complete.", flush=True)


if __name__ == "__main__":
    main()
