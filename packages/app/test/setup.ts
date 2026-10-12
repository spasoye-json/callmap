import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Opening a repo runs every extractor as its own process, which takes seconds on a loaded machine,
 * so every wait in the app tests allows for it.
 */
configure({ asyncUtilTimeout: 15_000 });

afterEach(cleanup);
