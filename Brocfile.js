import merge from 'broccoli-merge-trees';
import typescript from "broccoli-typescript-compiler";
import rollup from 'broccoli-rollup';

const tsCompilerOpts = {
  module: "es6",
  target: "es2018",
  moduleResolution: "classic",
  newLine: "LF",
  rootDir: "src",
  outDir: "dist",
  allowJs: true,
  sourceMap: true,
  declaration: false,
};

var cjsTree = typescript('src', {
  tsconfig: {
    compilerOptions: tsCompilerOpts,
    files: ["src/lib/main/index.ts", "src/lib/main/app.ts","src/lib/main/thread.ts","src/lib/main/vm.ts"],
  },
  throwOnError: false,
  annotation: "compile program",
});

var workerTree = typescript('src', {
  tsconfig: {
    compilerOptions: tsCompilerOpts,
    files: ["src/lib/worker-thread/ww.ts", "src/lib/worker-thread/hooks.ts"],
  },
  throwOnError: false,
  annotation: "compile program",
});

export default merge(['src', workerTree, rollup(cjsTree, {
    rollup: {
      input: 'lib/main/index.js',
      output: {
        file: 'index.js',
        format: 'es',
      },
    } })
]);