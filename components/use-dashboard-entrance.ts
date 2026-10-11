"use client";
import { useEffect, type RefObject } from "react";

export function useDashboardEntrance(
  root: RefObject<HTMLElement | null>,
  view: string,
) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let scope: { revert: () => void } | undefined;
    const stop = () => scope?.revert();
    if (!media.matches && root.current?.querySelector(".kpi")) {
      void import("animejs").then(({ createScope, animate, stagger }) => {
        if (disposed || media.matches || !root.current?.querySelector(".kpi"))
          return;
        scope = createScope({ root }).add(() => {
          animate(".kpi", {
            translateY: [8, 0],
            duration: 350,
            delay: stagger(45),
            ease: "outQuad",
          });
        });
      });
    }
    media.addEventListener("change", stop);
    return () => {
      disposed = true;
      stop();
      media.removeEventListener("change", stop);
    };
  }, [root, view]);
}
