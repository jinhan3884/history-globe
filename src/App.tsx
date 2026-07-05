import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

function App() {
  const cesiumContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cesiumContainer.current) return;

    // Token은 나중에 넣으세요 (지금은 생략)
    // Cesium.Ion.defaultAccessToken = 'YOUR_TOKEN';

    const initCesium = async () => {
      const viewer = new Cesium.Viewer(cesiumContainer.current!, {
        terrainProvider: await Cesium.createWorldTerrainAsync(),  // ← 여기 수정됨
        timeline: false,
        animation: false,
      });

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(126.98, 37.56, 1500000),
        duration: 2,
      });

      // 국가 경계
      Cesium.GeoJsonDataSource.load('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
        .then((dataSource) => {
          viewer.dataSources.add(dataSource);
        });

      return viewer;
    };

    let viewer: Cesium.Viewer;
    initCesium().then(v => viewer = v);

    return () => {
      if (viewer) viewer.destroy();
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div ref={cesiumContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

export default App;