"use client";

import { useEffect } from "react";
import { requestTopModalClose } from "@/components/ui/ModalCloseButton";

export function ModalKeyboardBridge() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) {
        return;
      }

      if (requestTopModalClose()) {
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}
