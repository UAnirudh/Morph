export default function StudioLoading() {
  return (
    <div className="px-4 py-5 lg:px-6" aria-busy="true" aria-label="Loading workspace">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="skeleton h-4 w-52" />
          <div className="skeleton h-3 w-72" />
        </div>
        <div className="skeleton h-8 w-32" />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="panel h-[104px] animate-morph-pulse p-4">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton mt-4 h-6 w-20" />
            <div className="skeleton mt-3 h-2 w-32" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="panel h-[280px] xl:col-span-2" />
        <div className="panel h-[280px]" />
      </div>
      <div className="mt-4 panel h-[320px]" />
    </div>
  );
}
