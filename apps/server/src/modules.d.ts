declare module '*.ttf' {
  const data: ArrayBuffer;
  export default data;
}

declare module '@resvg/resvg-wasm/index_bg.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
