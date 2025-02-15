declare module 'react-leaflet-heatmap-layer-v3' {
    import { LayerProps } from 'react-leaflet';
  
    export interface HeatmapLayerProps extends LayerProps {
      points: any[];
      longitudeExtractor: (point: any) => number;
      latitudeExtractor: (point: any) => number;
      intensityExtractor: (point: any) => number;
      radius?: number;
      blur?: number;
      maxZoom?: number;
      minOpacity?: number;
      maxOpacity?: number;
      fitBoundsOnLoad?: boolean;
      fitBoundsOnUpdate?: boolean;
    }
  
    export const HeatmapLayer: React.FC<HeatmapLayerProps>;
  }