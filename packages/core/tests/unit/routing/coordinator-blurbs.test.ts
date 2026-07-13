import { describe, it, expect } from 'vitest';
import { createDefaultTaskRouter } from '../../../src/routing/index.js';

describe('TaskRouter.getCoordinatorBlurbs', () => {
  const router = createDefaultTaskRouter();

  it('includes officecli blurb only for office tasks', () => {
    const office = router.getCoordinatorBlurbs('做一个 PPT');
    expect(office.some(b => b.includes('officecli'))).toBe(true);

    const general = router.getCoordinatorBlurbs('hello');
    expect(general).toHaveLength(0);
  });
});
