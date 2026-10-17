import { AppShell } from "@/components/shell/app-shell";
import { CanvasShell } from "@/components/canvas/canvas-shell";
import scaffoldData from "@/lib/scaffold-data.json";
import { ParserResult } from "@/lib/parser/types";

export const instant = false;

export default function PreviewPage() {
  const data = scaffoldData as unknown as ParserResult;

  return (
    <AppShell currentOrgName="Scaffold Preview" currentOrgId="preview-local">
      <CanvasShell data={data} />
    </AppShell>
  );
}