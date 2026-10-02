"use client";

import type { MouseEvent } from "react";

export function requestTopModalClose(source?: Element | null) {
  const backdrop =
    source?.closest(".pda-modal-backdrop") ??
    document.elementFromPoint(2, window.innerHeight - 2)?.closest(".pda-modal-backdrop") ??
    Array.from(document.querySelectorAll(".pda-modal-backdrop")).at(-1);

  if (!backdrop) {
    return false;
  }

  backdrop.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  return true;
}

export function ModalCloseButton() {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    requestTopModalClose(event.currentTarget);
  }

  return (
    <button aria-label="Закрыть окно" className="modal-close-button" onClick={handleClick} title="Закрыть (Esc)" type="button">
      <span aria-hidden="true">×</span>
    </button>
  );
}
