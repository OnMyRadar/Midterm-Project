1. Injecting Color

At draw time, each vertex pulls its own slice of the color buffer through in vec3/vec4 attribute, and the color is still a per-vertex value. The rasterizer interpolates and the fragment shader receives it to assign a unique value per pixel (in vec3 vColor).

2. Spatial Journey

A vertex travels through several spaces before it transforms to a pixel The model space was baked into the mesh, cube corners are defined as around its own origin. In the world space, the model space is multiplied by the model matrix that places the object relative to every other object, and the mesh can be reused at different positions and orientations on screen. In the view space, the world space is multiplied by a view matrix and re-expresses every point relative to the camera. It moves the whole "world" so the camera sits at origin. Finally, the projection matrix transforms view into clip space, where XYZ are normalized to -1 to +1 range. The Z feeds the depth buffer and lets a nearer triangle occlude a farther one.

3. Efficiency and State
WebGL is a state machine, so they mutate when a shared global configuration persists until something changes it. For example, if there are two different meshes (in this case an opaque sword and a set of particles), whichever buffer that was bound last is currently active. One bindBuffer that wasn't put can call and an unrelated draw would silently corrupt.

A VAO can change this by acting as a blueprint that remembers an entire attribute configuration, instead of re-issuing set-up calls. Binding a VAO can't leak or be corrupted by another object's setup. 