import { database } from '../shared/database';
import { processOneJob } from '../modules/payment-workflow/jobs';
import { processOnePayment } from '../modules/reap-payments/payments';

let stopping = false;
const stop = () => { stopping = true; };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

while (!stopping) {
  try {
    if (await processOneJob()) continue;
    if (await processOnePayment()) continue;
  } catch (error) {
    process.stderr.write(`Worker: PostgreSQL no disponible: ${error instanceof Error ? error.message : 'error desconocido'}\n`);
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 5_000);
    if (stopping) { clearTimeout(timer); resolve(); }
  });
}

await database().end();
