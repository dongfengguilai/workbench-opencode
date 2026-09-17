import { Suspense, type ParentProps } from "solid-js"
import { WorkBenchShell } from "@/workbench"
import { setV2Toast, ToastRegion } from "@/utils/toast"
export default function NewLayout(props: ParentProps) {
  setV2Toast(true)
  return <WorkBenchShell><Suspense>{props.children}</Suspense><ToastRegion v2 /></WorkBenchShell>
}
