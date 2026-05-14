type ActionAuthorLineProps = {
  action: "Закрывает" | "Изменяет" | "Оформляет" | "Принимает";
  name?: string;
};

export function ActionAuthorLine({ action, name }: ActionAuthorLineProps) {
  return (
    <p className="action-author-line">
      <span>{action}:</span> {name?.trim() || "текущий пользователь"}
    </p>
  );
}
