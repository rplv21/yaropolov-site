// У pdfmake 0.2 нет собственных типов: объявляем нужные модули вручную
declare module 'pdfmake/build/pdfmake.js' {
  const pdfMake: {
    vfs: Record<string, string>;
    fonts: Record<string, Record<string, string>>;
    createPdf: (def: unknown) => { getBuffer: (cb: (buf: Uint8Array) => void) => void };
  };
  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts.js' {
  const vfs: Record<string, string>;
  export default vfs;
}
