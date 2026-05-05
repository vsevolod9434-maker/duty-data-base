type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: "primary" | "warning" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  confirmTone = "primary",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="pda-modal-backdrop">
      <div className="pda-modal confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="section-header modal-header">
          <div className="min-w-0">
            <h1 id="confirm-dialog-title">{title}</h1>
            <p>{message}</p>
          </div>
        </div>

        <div className="modal-actions confirm-dialog-actions">
          <button className="command-row" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button className={`primary-command confirm-dialog-confirm confirm-dialog-confirm-${confirmTone}`} onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
