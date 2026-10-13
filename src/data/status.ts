// Временный индикатор «Статус Яндекс.Директа» в шапке сайта.
// Чтобы переключить огонёк, поменяйте state на 'up' (зелёный) или 'down' (красный)
// и выложите сайт. Когда авария забудется, индикатор можно убрать совсем:
// удалить блок .dstatus в src/layouts/AvLayout.astro.
export const directStatus = {
  state: 'down' as 'down' | 'up',
  href: '/articles/yandeks-direkt-posle-avarii-v-data-centrah',
  text: {
    down: 'Кабинет Директа недоступен, но кампании продолжают работать',
    up: 'Яндекс.Директ работает в обычном режиме',
  },
};
