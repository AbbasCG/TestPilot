import { useQueryClient } from "@tanstack/react-query";
export function Notice({ error }: { error?: Error | null }) {
  return error ? (
    <div className="error" role="alert">
      {error.message}
    </div>
  ) : null;
}
export function Busy() {
  return (
    <div className="empty" role="status">
      جارٍ تحميل بيانات الاختبار…
    </div>
  );
}
export function useRefreshTesting(project: number) {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: ["testing", project] });
    client.invalidateQueries({ queryKey: ["activity", project] });
    client.invalidateQueries({ queryKey: ["dashboard"] });
  };
}
