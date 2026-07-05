import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

function App() {
  const cesiumRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cesiumRef.current) return;

    const viewer = new Cesium.Viewer(cesiumRef.current, {
      terrainProvider: new Cesium.EllipsoidTerrainProvider(), // 기본 구형 지구
      baseLayerPicker: false,
      geocoder: false,
      homeButton: true,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
    });

    // 초기 위치 (한국 근처)
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(127, 37.5, 2500000),
      duration: 2
    });

    return () => {
      viewer.destroy();
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div ref={cesiumRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

export default App;