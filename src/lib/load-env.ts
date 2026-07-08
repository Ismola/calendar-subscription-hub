const loadEnvFile = (process as NodeJS.Process & {
    loadEnvFile?: () => void;
}).loadEnvFile;

if (typeof loadEnvFile === "function") {
    loadEnvFile();
}