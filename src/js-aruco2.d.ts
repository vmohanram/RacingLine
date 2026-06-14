declare module "js-aruco2" {
  export const AR: {
    Detector: new (config?: {
      dictionaryName?: string;
      maxHammingDistance?: number;
    }) => {
      detect(image: ImageData): Array<{
        id: number;
        corners: Array<{ x: number; y: number }>;
      }>;
    };
    Dictionary: new (dictionaryName: string) => {
      generateSVG(id: number): string;
    };
  };
}
