/* Render GitHub's diagram fence formats in Grip's local browser preview. */
(function () {
  'use strict';

  var CDN = 'https://cdn.jsdelivr.net/npm/';
  /* Pinned and transpiled to Safari 12 for older xwidget WebKit engines. */
  var MERMAID_BUNDLE = 'mermaid-11.16.0-legacy.min.js';
  var currentScript = document.currentScript;
  var staticBase = currentScript && currentScript.src ?
    currentScript.src.slice(0, currentScript.src.lastIndexOf('/') + 1) : '';
  var loadedScripts = {};
  var importMapInstalled = false;
  var mermaid;
  var diagramId = 0;
  var mermaidThemeVariables = {
    background: '#0d1117',
    primaryColor: '#27133f',
    primaryTextColor: '#f5f0ff',
    primaryBorderColor: '#a371f7',
    secondaryColor: '#201137',
    tertiaryColor: '#170b29',
    lineColor: '#c297ff',
    clusterBkg: '#24113d',
    clusterBorder: '#a371f7',
    edgeLabelBackground: '#2b174a'
  };
  var mermaidThemeCSS = [
    '.flowchart-link { stroke: #c297ff !important; stroke-width: 1.6px !important; }',
    '.marker, .arrowheadPath { fill: #c297ff !important; stroke: #c297ff !important; }',
    '.node rect, .node polygon, .node circle { stroke: #a371f7 !important; }',
    '.nodeLabel, .nodeLabel tspan { fill: #f5f0ff !important; }',
    '.edgeLabel text { fill: #f5f0ff !important; }',
    '.edgeLabel .background { fill: #2b174a !important; stroke: none !important; }'
  ].join(' ');

  function loadScript(url) {
    if (loadedScripts[url]) return loadedScripts[url];
    loadedScripts[url] = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return loadedScripts[url];
  }

  function installThreeImportMap() {
    if (importMapInstalled) return;
    var map = document.createElement('script');
    map.type = 'importmap';
    map.textContent = JSON.stringify({imports: {
      three: CDN + 'three@0.180.0/build/three.module.min.js',
      'three/addons/': CDN + 'three@0.180.0/examples/jsm/'
    }});
    document.head.appendChild(map);
    importMapInstalled = true;
  }

  function source(pre) {
    return pre.textContent.replace(/\n$/, '');
  }

  function replace(pre, className) {
    var element = document.createElement('div');
    element.className = 'grip-diagram ' + className;
    pre.parentNode.replaceChild(element, pre);
    pre._gripDiagramElement = element;
    return element;
  }

  function fail(element, error) {
    element.classList.add('grip-diagram-error');
    element.textContent += '\n\nGrip could not render this diagram: ' + error.message;
  }

  function prefersDarkTheme() {
    return document.documentElement.dataset.colorMode === 'dark' ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function addMermaidControls(element, svg) {
    var scale = 1;
    var controls = document.createElement('div');
    controls.className = 'grip-diagram-controls';
    var viewport = document.createElement('div');
    viewport.className = 'grip-mermaid-viewport';
    viewport.appendChild(svg);

    function applyScale() {
      svg.style.width = (scale * 100) + '%';
      svg.setAttribute('aria-label', 'Mermaid diagram at ' + Math.round(scale * 100) + '% zoom');
    }

    [['−', 'Zoom out', function () { scale = Math.max(0.5, scale - 0.1); }],
     ['+', 'Zoom in', function () { scale = Math.min(3, scale + 0.1); }],
     ['Reset', 'Reset zoom', function () { scale = 1; }]].forEach(function (definition) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = definition[0];
      button.title = definition[1];
      button.addEventListener('click', function () {
        definition[2]();
        applyScale();
      });
      controls.appendChild(button);
    });

    element.appendChild(controls);
    element.appendChild(viewport);
    applyScale();
  }

  async function renderMermaid(pre) {
    if (!mermaid) {
      await loadScript(staticBase + MERMAID_BUNDLE);
      mermaid = window.GripMermaid &&
        (window.GripMermaid.default || window.GripMermaid);
      if (!mermaid) throw new Error('Bundled Mermaid failed to load');
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: prefersDarkTheme() ? 'dark' : 'default',
        themeVariables: mermaidThemeVariables,
        themeCSS: mermaidThemeCSS
      });
    }
    var element = replace(pre, 'grip-diagram-mermaid');
    diagramId += 1;
    var result = await mermaid.render('grip-mermaid-' + diagramId, source(pre));
    var wrapper = document.createElement('div');
    wrapper.innerHTML = result.svg;
    addMermaidControls(element, wrapper.firstElementChild);
  }

  async function renderMap(pre, type) {
    await loadScript(CDN + 'leaflet@1.9.4/dist/leaflet.js');
    if (!document.querySelector('link[data-grip-leaflet]')) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = CDN + 'leaflet@1.9.4/dist/leaflet.css';
      css.setAttribute('data-grip-leaflet', '');
      document.head.appendChild(css);
    }
    if (type === 'topojson') await loadScript(CDN + 'topojson-client@3/dist/topojson-client.min.js');
    var element = replace(pre, 'grip-diagram-map');
    var data = JSON.parse(source(pre));
    if (type === 'topojson') {
      var features = Object.keys(data.objects).map(function (key) {
        return window.topojson.feature(data, data.objects[key]);
      });
      data = {type: 'FeatureCollection', features: features};
    }
    var map = window.L.map(element, {scrollWheelZoom: false});
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    var layer = window.L.geoJSON(data, {
      pointToLayer: function (feature, latlng) {
        return window.L.circleMarker(latlng, {radius: 7});
      }
    }).addTo(map);
    if (layer.getBounds().isValid()) map.fitBounds(layer.getBounds(), {padding: [16, 16]});
    else map.setView([0, 0], 2);
  }

  async function renderStl(pre) {
    installThreeImportMap();
    var modules = await Promise.all([
      import('three'),
      import('three/addons/loaders/STLLoader.js'),
      import('three/addons/controls/OrbitControls.js')
    ]);
    var THREE = modules[0];
    var STLLoader = modules[1].STLLoader;
    var OrbitControls = modules[2].OrbitControls;
    var element = replace(pre, 'grip-diagram-stl');
    var renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(element.clientWidth || 640, element.clientHeight || 360);
    element.appendChild(renderer.domElement);
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6f8fa);
    var camera = new THREE.PerspectiveCamera(45, renderer.domElement.width / renderer.domElement.height, 0.1, 10000);
    var geometry = new STLLoader().parse(new TextEncoder().encode(source(pre)).buffer);
    geometry.computeBoundingBox();
    var center = geometry.boundingBox.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    var size = geometry.boundingBox.getSize(new THREE.Vector3()).length() || 1;
    var mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color: 0x0969da, metalness: 0.1, roughness: 0.7}));
    scene.add(mesh, new THREE.HemisphereLight(0xffffff, 0x57606a, 2));
    camera.position.set(size, size, size);
    var controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.update();
    (function draw() {
      requestAnimationFrame(draw);
      renderer.render(scene, camera);
    }());
  }

  function render(pre) {
    var type = pre.getAttribute('data-grip-diagram');
    if (!type || pre.getAttribute('data-grip-rendered')) return;
    pre.setAttribute('data-grip-rendered', '');
    var fallback = source(pre);
    var task = type === 'mermaid' ? renderMermaid(pre) :
      type === 'stl' ? renderStl(pre) : renderMap(pre, type);
    task.catch(function (error) {
      var element = pre._gripDiagramElement || pre;
      element.textContent = fallback;
      fail(element, error);
    });
  }

  window.GripDiagrams = {
    render: function (root) {
      (root || document).querySelectorAll('pre[data-grip-diagram]').forEach(render);
    }
  };
}());
