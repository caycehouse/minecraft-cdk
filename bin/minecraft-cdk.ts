#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { MinecraftCdkStack } from '../lib/minecraft-cdk-stack';

const app = new cdk.App();
new MinecraftCdkStack(app, 'MinecraftCdkStack', {
    description: 'Minecraft Spot Price Server via Docker / ECS'
});
