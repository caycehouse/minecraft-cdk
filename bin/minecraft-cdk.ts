#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { MinecraftCdkStack } from '../lib/minecraft-cdk-stack';

const app = new cdk.App({
    context: {
        instanceType: "t3.medium",
        keyPairName: "",
        minecraftImageTag: "latest",
        serverState: "Stopped",
        spotPrice: "0.015",
        yourIPv4: ""
    },
});

new MinecraftCdkStack(app, 'MinecraftCdkStack', {
    description: 'Minecraft Spot Price Server via Docker / ECS'
});
