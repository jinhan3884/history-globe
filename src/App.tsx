import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

function App() {
  const cesiumContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cesiumContainer.current) return;

    // Cesium Ion Token (아래에 본인 토큰을 넣으세요)
    //Cesium.Ion.defaultAccessToken = 'YOUR_CESIUM_ION_TOKEN_HERE';

    const viewer = new Cesium.Viewer(cesiumContainer.current, {
      terrainProvider: Cesium.createWorldTerrain(),
      timeline: false,     // 나중에 시간 슬라이더 켜기
      animation: false,
    });

    // 서울에서 시작
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(126.98, 37.56, 1500000),
      duration: 2,
    });

    // 현재 국가 경계 추가 (예시)
    Cesium.GeoJsonDataSource.load('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
      .then((dataSource) => {
        viewer.dataSources.add(dataSource);
        viewer.zoomTo(dataSource);
      })
      .catch(console.error);

    // 클린업
    return () => {
      viewer.destroy();
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div ref={cesiumContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

export default App;