import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

function App() {
  const cesiumContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cesiumContainer.current) return;

    const viewer = new Cesium.Viewer(cesiumContainer.current, {
      terrainProvider: new Cesium.EllipsoidTerrainProvider(), // ← 지형 임시 OFF
      timeline: false,
      animation: false,
      baseLayerPicker: false,
    });

    // 서울 위치
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(126.98, 37.56, 2000000),
      duration: 3,
    });

    // 국가 경계
    Cesium.GeoJsonDataSource.load('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
      .then((dataSource) => {
        viewer.dataSources.add(dataSource);
      })
      .catch(console.error);

    return () => viewer.destroy();
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div ref={cesiumContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

export default App;