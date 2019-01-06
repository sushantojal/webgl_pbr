var cubeRotation = 0.0;
var gl = {};
var mesh = {};


var camPos = vec3.create();
var metallic = 0.8;
var roughness = 0.7;
var lightPosition = vec3.fromValues(0.3, 0.5, -3);
var lightColor = vec3.fromValues(1.0, 1.0, 1.0);
var ao = 0.3;
var albedo = vec3.fromValues(1.0, 0.0, 0.0);

var controls;

var FizzyText = function() {
  this.metallic = metallic;
  this.roughness = roughness;
  this.lightColor= [255, 255, 255];
  this.albedo = [255, 0, 0];
  this.ambientComponent = ao;
  this.lightPositionX = 0.3;
};



window.onload = function() {

    canvas = document.getElementById('glcanvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var sphModel = document.getElementById('sphereobj').innerHTML;
    mesh = new OBJ.Mesh(sphModel);
    main();

    controls = new FizzyText();
    var gui = new dat.GUI();
    var matProps = gui.addFolder('Material')
    matProps.add(controls, 'metallic', 0, 1).onChange(setProps);
    matProps.add(controls, 'roughness', 0, 1).onChange(setProps);
    gui.addColor(controls, 'lightColor').onChange(setProps);
    gui.addColor(controls, 'albedo').onChange(setProps);
    gui.add(controls, 'ambientComponent', 0, 1).onChange(setProps);
    gui.add(controls, 'lightPositionX', -1, 1).onChange(setProps);

};

function setProps() {
  metallic = controls.metallic;
  roughness = controls.roughness;
  lightColor[0] = controls.lightColor[0]/255;
  lightColor[1] = controls.lightColor[1]/255;
  lightColor[2] = controls.lightColor[2]/255;

  albedo[0] = controls.albedo[0]/255;
  albedo[1] = controls.albedo[1]/255;
  albedo[2] = controls.albedo[2]/255;

  ao = controls.ambientComponent;
  lightPosition[0] = controls.lightPositionX;
}



function main() {
  const canvas = document.querySelector('#glcanvas');
  gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

  // If we don't have a GL context, give up now

  if (!gl) {
    alert('Unable to initialize WebGL. Your browser or machine may not support it.');
    return;
  }

  // Vertex shader program

  const vsSource = `
    attribute vec3 aVertexPosition;
    attribute vec3 aVertexNormal;

    varying mediump vec3 WorldPos;
    varying mediump vec3 Normal;

    uniform mat4 uNormalMatrix;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;

    void main(void) {
      WorldPos = (uModelViewMatrix * vec4(aVertexPosition, 1.0)).xyz;
      Normal = (uNormalMatrix * vec4(aVertexNormal, 1.0)).xyz;
      gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aVertexPosition, 1.0);
    }
  `;

  // Fragment shader program

  const fsSource = `

  // in vec2 TexCoords;
  varying mediump vec3 WorldPos;
  varying mediump vec3 Normal;

  uniform mediump vec3 camPos;

  uniform mediump vec3  albedo;
  uniform mediump float metallic;
  uniform mediump float roughness;
  uniform mediump float ao;

  uniform mediump vec3 lightPosition;
  uniform mediump vec3 lightColor;

  mediump float PI = 3.14159265359;

    //specular components

    //fresnel/specular fraction (or the fraction of light that gets reflected)
    mediump vec3 fresnelSchlick(mediump float cosTheta, mediump vec3 F0)
    {
      return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
    }

    //normal distribution, depends on roughness of the material.
    //also, proportional to the alignment of microfacets to the half vector
    mediump float DistributionGGX(mediump vec3 N, mediump vec3 H, mediump float roughness)
    {
        mediump float a1      = roughness*roughness;
        mediump float a2     = a1 * a1;
        mediump float NdotH  = max(dot(N, H), 0.0);
        mediump float NdotH2 = NdotH*NdotH;

        mediump float num   = a2;
        mediump float denom = (NdotH2 * (a2 - 1.0) + 1.0);
        denom = PI * denom * denom;

        return num / denom;
    }

    //self occlusion due to the roughness of the material
    mediump float GeometrySchlickGGX(mediump float NdotV,mediump float roughness)
    {
        mediump float r = (roughness + 1.0);
        mediump float k = (r*r) / 8.0;

        mediump float num   = NdotV;
        mediump float denom = NdotV * (1.0 - k) + k;

        return num / denom;
    }
    mediump float GeometrySmith(mediump vec3 N,mediump vec3 V, mediump vec3 L, mediump float roughness)
    {
        mediump float NdotV = max(dot(N, V), 0.0);
        mediump float NdotL = max(dot(N, L), 0.0);
        mediump float ggx2  = GeometrySchlickGGX(NdotV, roughness);
        mediump float ggx1  = GeometrySchlickGGX(NdotL, roughness);

        return ggx1 * ggx2;
    }

    void main(void) {

      mediump vec3 N = normalize(Normal);
      mediump vec3 V = normalize(camPos - WorldPos);

      mediump vec3 Lo = vec3(0.0);

      //iterate for multiple lights
      //for(int i = 0; i < 1; ++i)
      // {
        mediump vec3 L = normalize(lightPosition - WorldPos);
        mediump vec3 H = normalize(V + L);
        mediump float distance    = length(lightPosition - WorldPos);
        mediump float attenuation = 1.0 / (distance * distance);
        mediump vec3 radiance     = lightColor * attenuation;


        //find three components responsible for specular output

        //fresnel
        //for dielectrics low value of base refelectivity
        mediump vec3 F0 = vec3(0.04);
        F0      = mix(F0, albedo, metallic);
        mediump vec3 F  = fresnelSchlick(max(dot(H, V), 0.0), F0);

        //normal distribution
        mediump float NDF = DistributionGGX(N, H, roughness);

        //geometric occlusion
        mediump float G   = GeometrySmith(N, V, L, roughness);

        mediump vec3 numerator    = NDF * G * F;
        mediump float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0);
        mediump vec3 specular     = numerator / max(denominator, 0.001);

        mediump vec3 kS = F;
        mediump vec3 kD = vec3(1.0) - kS;

        kD *= 1.0 - metallic;

        mediump float NdotL = max(dot(N, L), 0.0);
        Lo = (kD * albedo / PI + specular) * radiance * NdotL;
      // }

      mediump vec3 ambient = 0.03 * albedo * ao;
      mediump vec3 color = ambient + Lo;

      color = color / (color + vec3(1.0));
      color = pow(color, vec3(1.0/2.2));

      gl_FragColor = vec4(color, 1.0);

    }
  `;

  // Initialize a shader program; this is where all the lighting
  // for the vertices and so forth is established.
  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

  // Collect all the info needed to use the shader program.
  // Look up which attributes our shader program is using
  // for aVertexPosition, aVevrtexColor and also
  // look up uniform locations.
  const programInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      vertexNormal: gl.getAttribLocation(shaderProgram, 'aVertexNormal'),
    },
    uniformLocations: {
      lightPosition: gl.getUniformLocation(shaderProgram, 'lightPosition'),
      lightColor: gl.getUniformLocation(shaderProgram, 'lightColor'),
      albedo: gl.getUniformLocation(shaderProgram, 'albedo'),
      ao: gl.getUniformLocation(shaderProgram, 'ao'),
      roughness: gl.getUniformLocation(shaderProgram, 'roughness'),
      metallic: gl.getUniformLocation(shaderProgram, 'metallic'),
      cameraPosition: gl.getUniformLocation(shaderProgram, 'camPos'),
      normalMatrix: gl.getUniformLocation(shaderProgram, 'uNormalMatrix'),
      projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
    },
  };

  // Here's where we call the routine that builds all the
  // objects we'll be drawing.
  const buffers = initBuffers(gl);

  var then = 0;

  // Draw the scene repeatedly
  function render(now) {
    now *= 0.001;  // convert to seconds
    const deltaTime = now - then;
    then = now;

    drawScene(gl, programInfo, buffers, deltaTime);

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}


function initBuffers(gl) {

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.vertices), gl.STATIC_DRAW);


  const normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.vertexNormals),
              gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(mesh.indices), gl.STATIC_DRAW);

  return {
    position: positionBuffer,
    normal: normalBuffer,
    indices: indexBuffer,
  };
}

//
// Draw the scene.
//
function drawScene(gl, programInfo, buffers, deltaTime) {

  gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
  gl.clearDepth(1.0);                 // Clear everything
  gl.enable(gl.DEPTH_TEST);           // Enable depth testing
  gl.depthFunc(gl.LEQUAL);            // Near things obscure far things

  // Clear the canvas before we start drawing on it.

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Create a perspective matrix, a special matrix that is
  // used to simulate the distortion of perspective in a camera.
  // Our field of view is 45 degrees, with a width/height
  // ratio that matches the display size of the canvas
  // and we only want to see objects between 0.1 units
  // and 100 units away from the camera.

  const fieldOfView = 45 * Math.PI / 180;   // in radians
  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  const zNear = 0.1;
  const zFar = 100.0;
  const projectionMatrix = mat4.create();

  // note: glmatrix.js always has the first argument
  // as the destination to receive the result.
  mat4.perspective(projectionMatrix,
                   fieldOfView,
                   aspect,
                   zNear,
                   zFar);

  // Set the drawing position to the "identity" point, which is
  // the center of the scene.
  const modelViewMatrix = mat4.create();

  // Now move the drawing position a bit to where we want to
  // start drawing the square.

  mat4.translate(modelViewMatrix,     // destination matrix
                 modelViewMatrix,     // matrix to translate
                 [-0.0, 0.0, -5.0]);  // amount to translate

  const normalMatrix = mat4.create();
  mat4.invert(normalMatrix, modelViewMatrix);
  mat4.transpose(normalMatrix, normalMatrix);


  {
    const numComponents = 3;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.enableVertexAttribArray(
        programInfo.attribLocations.vertexPosition);
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        numComponents,
        type,
        normalize,
        stride,
        offset);
  }

  {
    const numComponents = 3;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normal);
    gl.enableVertexAttribArray(
        programInfo.attribLocations.vertexNormal);
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexNormal,
        numComponents,
        type,
        normalize,
        stride,
        offset);
  }

  // Tell WebGL which indices to use to index the vertices
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);

  // Tell WebGL to use our program when drawing

  gl.useProgram(programInfo.program);

  // Set the shader uniforms
  gl.uniform3f(programInfo.uniformLocations.lightPosition, lightPosition[0], lightPosition[1], lightPosition[2]);
  gl.uniform3f(programInfo.uniformLocations.lightColor, lightColor[0], lightColor[1], lightColor[2] );
  gl.uniform3f(programInfo.uniformLocations.albedo, albedo[0], albedo[1], albedo[2] );
  gl.uniform1f(programInfo.uniformLocations.ao, ao);
  gl.uniform1f(programInfo.uniformLocations.metallic, metallic);
  gl.uniform1f(programInfo.uniformLocations.roughness, roughness);
  gl.uniform3f( programInfo.uniformLocations.cameraPosition, camPos[0],  camPos[1],  camPos[2]);

  gl.uniformMatrix4fv(
    programInfo.uniformLocations.normalMatrix,
    false,
    normalMatrix
  );
  gl.uniformMatrix4fv(
      programInfo.uniformLocations.projectionMatrix,
      false,
      projectionMatrix);
  gl.uniformMatrix4fv(
      programInfo.uniformLocations.modelViewMatrix,
      false,
      modelViewMatrix);

  {
    const vertexCount = mesh.indices.length;
    const type = gl.UNSIGNED_SHORT;
    const offset = 0;
    gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
  }

  // Update the rotation for the next draw
  // cubeRotation += deltaTime;
}

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  // Create the shader program

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.log('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    return null;
  }

  return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
  const shader = gl.createShader(type);

  // Send the source to the shader object

  gl.shaderSource(shader, source);

  // Compile the shader program

  gl.compileShader(shader);

  // See if it compiled successfully

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.log('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}
