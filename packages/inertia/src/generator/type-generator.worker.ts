import { parentPort, workerData } from 'node:worker_threads'
import { runTypeGeneration } from './type-generator'

interface WorkerInput {
  cwd: string
}

async function main() {
  if (!parentPort) {
    throw new Error('[stratal:inertia-types] worker spawned without a parent port')
  }

  const { cwd } = workerData as WorkerInput

  try {
    const { outputPath, pageCount } = await runTypeGeneration(cwd)
    parentPort.postMessage({ ok: true, outputPath, pageCount })
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

void main()
