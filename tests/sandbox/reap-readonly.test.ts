import { expect, test } from 'vitest';
import { ReapClient } from '@/modules/reap-payments/client';

test.skipIf(process.env.RUN_SANDBOX_TESTS !== '1' || !process.env.REAP_API_KEY || !process.env.REAP_TEST_ENROLLMENT_ID)(
  'consulta un enrollment existente sin crear uno nuevo', async () => {
    const result = await new ReapClient().getEnrollment(process.env.REAP_TEST_ENROLLMENT_ID!);
    expect(result.id).toBe(process.env.REAP_TEST_ENROLLMENT_ID);
    expect(result.status.length).toBeGreaterThan(0);
  },
);
