type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  const previousPage = Math.max(1, page - 1);
  const nextPage = Math.min(pageCount, page + 1);

  return (
    <div className="pagination-row">
      <button
        className="command-row pagination-button"
        disabled={page <= 1}
        onClick={() => onPageChange(previousPage)}
        type="button"
      >
        Назад
      </button>
      <span>Страница {page} из {pageCount}</span>
      <button
        className="command-row pagination-button"
        disabled={page >= pageCount}
        onClick={() => onPageChange(nextPage)}
        type="button"
      >
        Вперёд
      </button>
    </div>
  );
}
