type MobileBackButtonProps = {
  label?: string;
  onClick: () => void;
};

export function MobileBackButton({ label = "К списку", onClick }: MobileBackButtonProps) {
  return (
    <button className="command-row mobile-back-button" onClick={onClick} type="button">
      <span aria-hidden="true">←</span>
      {label}
    </button>
  );
}
