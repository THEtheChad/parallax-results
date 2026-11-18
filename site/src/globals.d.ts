// ECharts is loaded from cdnjs as a global (index.html); the npm package provides only its types.
declare global {
  var echarts: typeof import("echarts");
}

export {};
