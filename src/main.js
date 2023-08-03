import * as THREE from "three";
import { OrbitControls } from '../threejs/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '../threejs/examples/jsm/loaders/GLTFLoader.js';
import GUI from '../threejs/examples/jsm/libs/lil-gui.module.min.js';

import * as CANNON from "../cannonjs/cannon-es.js";
import CannonDebugger from "../cannonjs/cannon-es-debugger.js";

let elThreejs = document.getElementById("threejs");
let camera, scene, renderer;

// helpers to debug
let axesHelper;
let controls;
let gui;

// show and move cube
let cubeThree;
let keyboard = {};

// camera follow player
let enableFollow = true;

// cannon variables
let world;
let cannonDebugger;
let timeStep = 1 / 60;
let cubeBody, planeBody;
let slipperyMaterial, groundMaterial;
let obstacleBody;
let obstaclesBodies = [];
let obstaclesMeshes = [];
const initialCarPosition = new CANNON.Vec3(0, 2, 0); // Car's initial position
const groundYPositionThreshold = -10; // Adjust this value based on your scene

init();

async function init() {
  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 10;
  camera.position.y = 5;

  // render
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.outputEncoding = THREE.sRGBEncoding;

  const ambient = new THREE.HemisphereLight(0xffffbb, 0x080820);
  scene.add(ambient);

  const light = new THREE.DirectionalLight(0xFFFFFF, 1);
  light.position.set(1, 10, 6);
  scene.add(light);

  // orbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.rotateSpeed = 1.0;
  controls.zoomSpeed = 1.2;
  controls.enablePan = false;
  controls.dampingFactor = 0.2;
  controls.minDistance = 10;
  controls.maxDistance = 500;
  controls.enabled = false;

  elThreejs.appendChild(renderer.domElement);

  initCannon();

  addBackground();

  addPlaneBody();
  addPlane();

  addCubeBody();
  await addCube();

  addObstacleBody();
  addObstacle();

  addContactMaterials();

  addKeysListener();
  addGUI();

  animate();
}

function animate() {
  renderer.render(scene, camera);

  movePlayer();

  if (enableFollow) followPlayer();

  world.step(timeStep);
  cannonDebugger.update();

  cubeThree.position.copy(cubeBody.position);
  cubeThree.position.y = cubeBody.position.y - 1.3;
  cubeThree.quaternion.copy(cubeBody.quaternion);

  for (let i = 0; i < obstaclesBodies.length; i++) {
    obstaclesMeshes[i].position.copy(obstaclesBodies[i].position);
    obstaclesMeshes[i].quaternion.copy(obstaclesBodies[i].quaternion);
  }

  // Check if the car falls below the Y position threshold
  if (cubeBody.position.y < groundYPositionThreshold) {
    resetCarPosition();
  }

  requestAnimationFrame(animate);
}

function addCubeBody() {
  let cubeShape = new CANNON.Box(new CANNON.Vec3(1, 1.3, 2));
  slipperyMaterial = new CANNON.Material('slippery');
  cubeBody = new CANNON.Body({ mass: 100, material: slipperyMaterial });
  cubeBody.addShape(cubeShape, new CANNON.Vec3(0, 0, -1));

  const polyhedronShape = createCustomShape();
  cubeBody.addShape(polyhedronShape, new CANNON.Vec3(-1, -1.3, 1));

  // change rotation
  cubeBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 2, 0), Math.PI / 180 * 180);

  cubeBody.position.set(0, 2, 0);

  cubeBody.linearDamping = 0.5;

  world.addBody(cubeBody);
}

async function addCube() {
  const gltfLoader = new GLTFLoader().setPath( 'src/assets/' );
	const carLoaddedd = await gltfLoader.loadAsync( 'car.glb' );

	cubeThree = carLoaddedd.scene.children[0];
  scene.add(cubeThree);

}

function addPlaneBody() {
  groundMaterial = new CANNON.Material('ground');
  const planeShape = new CANNON.Box(new CANNON.Vec3(10, 0.01, 150));
  planeBody = new CANNON.Body({ mass: 0, material: groundMaterial });
  planeBody.addShape(planeShape);
  planeBody.position.set(0, 0, -90);
  world.addBody(planeBody);
}

function addPlane() {
  const texture = new THREE.TextureLoader().load("src/assets/road.jpg");

  let geometry = new THREE.BoxGeometry(20, 0, 300);
  let material = new THREE.MeshBasicMaterial({ map: texture });
  let planeThree = new THREE.Mesh(geometry, material);
  planeThree.position.set(0, 0, -90);
  scene.add(planeThree);
}

function addObstacleBody() {
  for (let i = 0; i < 5; i++) {
    let obstacleShape = new CANNON.Box(new CANNON.Vec3(1, 1, 1));
    obstacleBody = new CANNON.Body({ mass: 1 });
    obstacleBody.addShape(obstacleShape);
    obstacleBody.position.set(0, 5, -(i + 1) * 15);

    world.addBody(obstacleBody);
    obstaclesBodies.push(obstacleBody);
  }
}

function addObstacle() {
  let geometry = new THREE.BoxGeometry(2, 2, 2);
  const texture = new THREE.TextureLoader().load("src/assets/obstacle.png");

  let material = new THREE.MeshBasicMaterial({ map: texture });

  let obstacle = new THREE.Mesh(geometry, material);

  for (let i = 0; i < 5; i++) {
    let obstacleMesh = obstacle.clone();
    scene.add(obstacleMesh);
    obstaclesMeshes.push(obstacleMesh);
  }
}

function addContactMaterials() {
  const slippery_ground = new CANNON.ContactMaterial(groundMaterial, slipperyMaterial, {
    friction: 0.00,
    restitution: 0.1, //bounciness
    contactEquationStiffness: 1e8,
    contactEquationRelaxation: 3,
  });

  // We must add the contact materials to the world
  world.addContactMaterial(slippery_ground);
}

function addKeysListener() {
  window.addEventListener('keydown', function (event) {
    keyboard[event.keyCode] = true;
  }, false);
  window.addEventListener('keyup', function (event) {
    keyboard[event.keyCode] = false;
  }, false);
}

// Add a variable to keep track of the time since the last rotation
let rotationTime = 0;

function movePlayer() {
  const strengthWS = 500;
  const strengthAD = 200;

  // Apply forward force
  const forceForward = new CANNON.Vec3(0, 0, strengthWS);
  if (keyboard[87]) {
    cubeBody.applyLocalForce(forceForward);
  }

  // Apply backward force
  const forceBack = new CANNON.Vec3(0, 0, -strengthWS);
  if (keyboard[83]) {
    cubeBody.applyLocalForce(forceBack);
  }

  // Apply left torque
  const forceLeft = new CANNON.Vec3(0, strengthAD, 0);
  if (keyboard[65]) {
    cubeBody.applyTorque(forceLeft);
  }

  // Apply right torque
  const forceRight = new CANNON.Vec3(0, -strengthAD, 0);
  if (keyboard[68]) {
    cubeBody.applyTorque(forceRight);
  }

  // Reset rotation forces after 1 second (adjust the duration as needed)
  if (rotationTime > 1) {
    cubeBody.angularVelocity.set(0, 0, 0);
    rotationTime = 0;
  }

  // Increment rotation time
  rotationTime += timeStep;
}

function followPlayer() {
  camera.position.x = cubeThree.position.x;
  camera.position.y = cubeThree.position.y + 5;
  camera.position.z = cubeThree.position.z + 10;
}

function addGUI() {
  gui = new GUI();
  const options = {
    orbitsControls: false
  };

  gui.add(options, 'orbitsControls').onChange(value => {
    if (value) {
      controls.enabled = true;
      enableFollow = false;
    } else {
      controls.enabled = false;
      enableFollow = true;
    }
  });
  gui.hide();

  // show and hide GUI if the user presses g
  window.addEventListener('keydown', function (event) {
    if (event.keyCode == 71) {
      if (gui._hidden) {
        gui.show();
      } else {
        gui.hide();
      }
    }
  });
}

function initCannon() {
  // Setup world
  world = new CANNON.World();
  world.gravity.set(0, -9.8, 0);

  initCannonDebugger();
}

function initCannonDebugger() {
  cannonDebugger = new CannonDebugger(scene, world, {
    onInit(body, mesh) {
      mesh.visible = false;
      // Toggle visibility on "d" press
      document.addEventListener("keydown", (event) => {
        if (event.key === "f") {
          mesh.visible = !mesh.visible;
        }
      });
    },
  });
}

function createCustomShape() {
  const vertices = [
    new CANNON.Vec3(2, 0, 0),
    new CANNON.Vec3(2, 0, 2),
    new CANNON.Vec3(2, 2, 0),
    new CANNON.Vec3(0, 0, 0),
    new CANNON.Vec3(0, 0, 2),
    new CANNON.Vec3(0, 2, 0),
  ];

  return new CANNON.ConvexPolyhedron({
    vertices,
    faces: [
      [3, 4, 5],
      [2, 1, 0],
      [1, 2, 5, 4],
      [0, 3, 4, 1],
      [0, 2, 5, 3],
    ],
  });
}

async function addBackground() {
  const gltfLoader = new GLTFLoader().setPath('src/assets/');

  const mountainLoaded = await gltfLoader.loadAsync('mountain.glb');
  let mountainMesh = mountainLoaded.scene.children[0];
  mountainMesh.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -Math.PI / 180 * 90);
  mountainMesh.position.set(0, 60, -90);
  mountainMesh.scale.set(0.008, 0.008, 0.008);
  scene.add(mountainMesh);

  const domeLoaded = await gltfLoader.loadAsync('skydome.glb'); 
  let domeMesh = domeLoaded.scene.children[0];
  domeMesh.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -Math.PI / 180 * 90);
  domeMesh.position.set(0, -40, 0);
  domeMesh.scale.set(0.1, 0.1, 0.1);
  scene.add(domeMesh);
}

function handleCollision(event) {
  // Check if the collision involves the car and the ground
  if (
    (event.body === cubeBody && event.target === planeBody) ||
    (event.body === planeBody && event.target === cubeBody)
  ) {
    resetCarPosition();
  }
}

function resetCarPosition() {
  cubeBody.position.copy(initialCarPosition);
  cubeBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 180 * 180);
  cubeBody.velocity.set(0, 0, 0);
  cubeBody.angularVelocity.set(0, 0, 0);
}