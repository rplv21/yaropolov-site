// Закрытые прототипы сайтов: /proto/<Имя>/. Вся логика в src/lib/protoRoute.ts.
import { makeRoutes } from '../../lib/protoRoute';

export const prerender = false;
export const { GET, POST } = makeRoutes('proto');
