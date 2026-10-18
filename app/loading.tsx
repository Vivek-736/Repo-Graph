export default function Loading() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-background font-mono text-xs select-none">
      <div className="flex flex-col items-center gap-3">
        <div className="relative flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-border border-t-accent animate-spin" />
          <div className="absolute h-2 w-2 rounded-full bg-accent" />
        </div>
        <div className="flex items-center gap-2 text-muted">
          <span>Loading RepoGraph...</span>
        </div>
      </div>
    </div>
  );
}