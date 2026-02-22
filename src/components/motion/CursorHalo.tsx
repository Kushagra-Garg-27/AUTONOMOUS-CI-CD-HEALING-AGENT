import { useEffect, useRef, useState, useCallback } from "react";

interface CursorHaloState {
  x: number;
  y: number;
  visible: boolean;
}

export const CursorHalo = () => {
  const [halo, setHalo] = useState<CursorHaloState>({
    x: 0,
    y: 0,
    visible: false,
  });
  const rafRef = useRef<number>(0);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });

  const animate = useCallback(() => {
    const lerp = 0.12;
    currentRef.current.x += (targetRef.current.x - currentRef.current.x) * lerp;
    currentRef.current.y += (targetRef.current.y - currentRef.current.y) * lerp;

    setHalo({
      x: currentRef.current.x,
      y: currentRef.current.y,
      visible: true,
    });

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      targetRef.current = { x: e.clientX, y: e.clientY };
    };

    const onLeave = () => setHalo((prev) => ({ ...prev, visible: false }));
    const onEnter = () => setHalo((prev) => ({ ...prev, visible: true }));

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      cancelAnimationFrame(rafRef.current);
    };
  }, [animate]);

  if (!halo.visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9998]"
      style={{ willChange: "transform" }}
    >
      <div
        className="absolute rounded-full"
        style={{
          width: 500,
          height: 500,
          left: halo.x - 250,
          top: halo.y - 250,
          background:
            "radial-gradient(circle, rgba(0, 255, 127, 0.04) 0%, transparent 60%)",
          willChange: "transform",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 30,
          height: 30,
          left: halo.x - 15,
          top: halo.y - 15,
          border: "1px solid rgba(0, 255, 127, 0.25)",
          background: "rgba(0, 255, 127, 0.05)",
          willChange: "transform",
          transition: "width 0.2s, height 0.2s",
        }}
      />
    </div>
  );
};
