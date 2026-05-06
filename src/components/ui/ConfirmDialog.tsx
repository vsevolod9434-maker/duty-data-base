type ConfirmDialogProps = {
  open?: boolean;
  title: string;
  description?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default" | "warning";
  confirmTone?: "primary" | "warning" | "danger";
  loading?: boolean;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  onClose?: () => void;
};

export function ConfirmDialog({
  open = true,
  title,
  description,
  message,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  variant = "default",
  confirmTone = "primary",
  loading = false,
  disabled = false,
  onConfirm,
  onCancel,
  onClose,
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  const tone = variant === "default" ? confirmTone : variant;
  const dialogMessage = description ?? message;
  const handleClose = onCancel ?? onClose;
  const handleDialogClose = () => {
    if (loading || disabled) {
      return;
    }

    handleClose?.();
  };

  return (
    <div className="pda-modal-backdrop animate-fade-in" onMouseDown={handleDialogClose}>
      <div
        className="pda-modal confirm-dialog animate-modal-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-header modal-header">
          <div className="min-w-0">
            <h1 id="confirm-dialog-title">{title}</h1>
            {dialogMessage ? <p>{dialogMessage}</p> : null}
          </div>
        </div>

        <div className="modal-actions confirm-dialog-actions">
          <button className="command-row interactive-button" disabled={loading || disabled} onClick={handleDialogClose} type="button">
            {cancelLabel}
          </button>
          <button
            className={`primary-command interactive-button confirm-dialog-confirm confirm-dialog-confirm-${tone}`}
            disabled={loading || disabled}
            onClick={onConfirm}
            type="button"
          >
            {loading ? "Выполнение..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
