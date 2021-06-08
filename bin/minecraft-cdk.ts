#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { MinecraftCdkStack } from '../lib/minecraft-cdk-stack';

const app = new cdk.App({
    context: {
        adminPlayerNames: undefined,
        difficulty: undefined,
        hostedZoneId: undefined,
        instanceType: "t3.medium",
        keyPairName: undefined,
        minecraftImageTag: "latest",
        minecraftTypeTag: undefined,
        memory: '3G',
        serverState: "Running",
        spotPrice: "0.015",
        whitelist: undefined,
        yourIPv4: undefined
    },
});

new MinecraftCdkStack(app, 'MinecraftCdkStack', {
    description: 'Minecraft Spot Price Server via Docker / ECS'
});
