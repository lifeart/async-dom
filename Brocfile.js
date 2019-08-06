import merge from 'broccoli-merge-trees';
import typescript from "broccoli-typescript-compiler";
import rollup from 'broccoli-rollup';
var cjsTree = typescript('src', {
  tsconfig: {
    compilerOptions: {
      module: "es6",
      target: "es2018",
      moduleResolution: "classic",
      newLine: "LF",
      rootDir: "src",
      outDir: "dist",
      allowJs: true,
      sourceMap: true,
      declaration: false,
    },
    files: ["src/lib/main/index.ts", "src/lib/main/app.ts","src/lib/main/thread.ts","src/lib/main/vm.ts"],
  },
  throwOnError: false,
  annotation: "compile program",
});


export default merge(['src', rollup(cjsTree, {
    rollup: {
      input: 'lib/main/index.js',
      output: {
        file: 'index.js',
        format: 'es',
      },
    } })
]);