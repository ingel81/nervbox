#!/usr/bin/env node
/**
 * Removes root motion (forward translation) from glTF walk animations.
 *
 * Usage: node fix-root-motion.js input.glb output.glb
 */

import { Document, NodeIO } from '@gltf-transform/core';

const [,, input, output] = process.argv;

if (!input || !output) {
  console.log('Usage: node fix-root-motion.js input.glb output.glb');
  process.exit(1);
}

const io = new NodeIO();

async function main() {
  const doc = await io.read(input);
  const root = doc.getRoot();

  // Find the root bone (usually "Root", "Hips", or "Armature")
  const rootBoneNames = ['root', 'hips', 'armature', 'pelvis'];

  for (const animation of root.listAnimations()) {
    const name = animation.getName();
    if (!name.toLowerCase().includes('walk')) continue;

    console.log(`Processing animation: ${name}`);

    for (const channel of animation.listChannels()) {
      const targetNode = channel.getTargetNode();
      const targetPath = channel.getTargetPath();

      if (!targetNode) continue;

      const nodeName = targetNode.getName()?.toLowerCase() || '';
      const isRootBone = rootBoneNames.some(n => nodeName.includes(n));

      // Remove translation channels on root bone (keeps rotation)
      if (isRootBone && targetPath === 'translation') {
        console.log(`  Removing translation from: ${targetNode.getName()}`);

        const sampler = channel.getSampler();
        if (sampler) {
          // Set all output values to 0 (or first frame value)
          const output = sampler.getOutput();
          if (output) {
            const arr = output.getArray();
            if (arr) {
              // Keep only first frame translation, repeat it
              const firstX = arr[0] || 0;
              const firstY = arr[1] || 0;
              const firstZ = arr[2] || 0;

              // Set all keyframes to first frame (removes forward motion)
              for (let i = 0; i < arr.length; i += 3) {
                arr[i] = firstX;
                arr[i + 1] = firstY;
                arr[i + 2] = firstZ;
              }
            }
          }
        }
      }
    }
  }

  await io.write(output, doc);
  console.log(`Saved: ${output}`);
}

main().catch(console.error);
