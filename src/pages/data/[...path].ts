// Закрытые отчёты для клиентов: /data/<Имя>/. Устроены как прототипы, вся логика в src/lib/protoRoute.ts.
import { makeRoutes } from '../../lib/protoRoute';

export const prerender = false;
export const { GET, POST } = makeRoutes('data');
