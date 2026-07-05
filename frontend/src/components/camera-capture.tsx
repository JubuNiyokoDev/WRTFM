import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, RefreshCw } from 'lucide-react';

interface CameraCaptureProps {
  mode: 'id' | 'selfie';
  onCapture: (base64Image: string) => void;
  onCancel: () => void;
}

export function CameraCapture({ mode, onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode === 'id' ? 'environment' : 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError(null);
    } catch (err: any) {
      setError("Impossible d'accéder à la caméra. Veuillez vérifier les permissions.");
    }
  }, [mode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCamera]);

  const handleCapture = () => {
    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      if (mode === 'selfie') {
        // Handle mirroring for front camera
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUri = canvas.toDataURL('image/jpeg', 0.85);
      
      // Stop camera before closing
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      onCapture(dataUri);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-[400px] bg-black rounded-xl overflow-hidden">
      {error ? (
        <div className="text-white text-center p-6">
          <p className="text-red-400 mb-4">{error}</p>
          <Button variant="secondary" onClick={startCamera}>
            <RefreshCw className="mr-2 h-4 w-4" /> Réessayer
          </Button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${mode === 'selfie' ? '-scale-x-100' : ''}`}
          />
          
          {/* Overlay Masks */}
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
            {/* Dark overlay with transparent cutout */}
            <div className="absolute inset-0 bg-black/50" />
            
            <div 
              className={`relative z-20 border-2 border-primary border-dashed shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] ${
                mode === 'id' 
                  ? 'w-[80%] h-[55%] rounded-xl' // ID Card shape
                  : 'w-[60%] h-[65%] rounded-[100%]' // Face oval shape
              }`}
            >
              {/* Target corners for ID mode */}
              {mode === 'id' && (
                <>
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary -mt-1 -ml-1 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary -mt-1 -mr-1 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary -mb-1 -ml-1 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary -mb-1 -mr-1 rounded-br-lg" />
                </>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="absolute top-4 w-full text-center z-20">
            <p className="text-white font-medium drop-shadow-md">
              {mode === 'id' ? 'Centrez la carte dans le cadre' : 'Placez votre visage dans l\'ovale'}
            </p>
          </div>

          {/* Controls */}
          <div className="absolute bottom-6 w-full flex items-center justify-center gap-6 z-20">
            <Button 
              size="icon" 
              variant="destructive" 
              className="rounded-full h-12 w-12 opacity-80 hover:opacity-100"
              onClick={() => {
                if (stream) stream.getTracks().forEach((track) => track.stop());
                onCancel();
              }}
            >
              <X className="h-6 w-6" />
            </Button>
            
            <Button 
              size="icon" 
              className="rounded-full h-16 w-16 bg-white hover:bg-gray-200 border-4 border-primary/30"
              onClick={handleCapture}
            >
              <Camera className="h-6 w-6 text-primary" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
