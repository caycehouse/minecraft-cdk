import { SynthUtils } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as MinecraftCdk from '../lib/minecraft-cdk-stack';

test('Snapshot Testing', () => {
    const app = new cdk.App({
        context: {
            instanceType: "t3.medium",
            minecraftImageTag: "latest",
            serverState: "Running",
            spotPrice: "0.015",
        }
    });
    const stack = new MinecraftCdk.MinecraftCdkStack(app, 'MyTestStack');
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
});
