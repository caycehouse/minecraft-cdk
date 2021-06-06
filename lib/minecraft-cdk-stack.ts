import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2'
import * as ecs from '@aws-cdk/aws-ecs';
import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as efs from '@aws-cdk/aws-efs';
import { Peer, Port } from '@aws-cdk/aws-ec2';
import { CfnParameter } from '@aws-cdk/core';

export class MinecraftCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const serverState = new CfnParameter(this, "serverState", {
      type: "String",
      description: "Running: A spot instance will launch shortly after setting this parameter; your Minecraft server should start within 5-10 minutes of changing this parameter (once UPDATE_IN_PROGRESS becomes UPDATE_COMPLETE). Stopped: Your spot instance (and thus Minecraft container) will be terminated shortly after setting this parameter.",
      default: "Running",
      allowedValues: ["Running", "Stopped"]
    });

    const instanceType = new CfnParameter(this, "instanceType", {
      type: "String",
      description: "t3.medium is a good cost effective instance, 2 vCPU and 4 GB of RAM with moderate network performance. Change at your discretion. https://aws.amazon.com/ec2/instance-types/.",
      default: "t3.medium"
    });

    const spotPrice = new CfnParameter(this, "spotPrice", {
      type: "String",
      description: "A spot price t3.medium is currently 0.0135 per hour on average.",
      default: "0.0135"
    });

    const keyPairName = new CfnParameter(this, "keyPairName", {
      type: "String",
      description: "If you wish to access the instance via SSH, select a Key Pair to use. https://console.aws.amazon.com/ec2/v2/home?#KeyPairs:sort=keyName",
      default: '',
    });

    const yourIPv4 = new CfnParameter(this, "yourIPv4", {
      type: "String",
      description: "If you wish to access the instance via SSH and using IPv4, provide it.",
      default: '',
    });

    const hostedZoneID = new CfnParameter(this, "hostedZoneID", {
      type: "String",
      description: "If you have a hosted zone in Route 53 and wish to update a DNS record whenever your Minecraft instance starts, supply the hosted zone ID here.",
      default: '',
    });

    const recordName = new CfnParameter(this, "recordName", {
      type: "String",
      description: "If you have a hosted zone in Route 53 and wish to set a DNS record whenever your Minecraft instance starts, supply a record name here (e.g. minecraft.mydomain.com).",
      default: '',
    });

    const minecraftImageTag = new CfnParameter(this, "minecraftImageTag", {
      type: "String",
      description: "Java version (Examples include latest, adopt13, openj9, etc) Refer to tag descriptions available here: https://github.com/itzg/docker-minecraft-server).",
      default: "latest"
    });

    const minecraftTypeTag = new CfnParameter(this, "minecraftTypeTag", {
      type: "String",
      description: "(Examples include SPIGOT, BUKKIT, TUINITY, etc) Refer to tag descriptions available here: https://github.com/itzg/docker-minecraft-server).",
      default: 'VANILLA'
    });

    const adminPlayerNames = new CfnParameter(this, "adminPlayerNames", {
      type: "String",
      description: "A comma delimited list (no spaces) of player names to be admins.",
      default: '',
    });

    const difficulty = new CfnParameter(this, "difficulty", {
      type: "String",
      description: "Examples include peaceful, easy (default), normal, and hard.",
      default: 'easy',
    });

    const whitelist = new CfnParameter(this, "whitelist", {
      type: "String",
      description: "A comma delimited list (no spaces) of player names.",
      default: '',
    });

    // Create an EC2 Vpc
    const vpc = new ec2.Vpc(this, 'Vpc', {
      subnetConfiguration: [
        {
          name: "minecraftPublicSubnet",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    })

    // Create an ECS Cluster
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
    });

    // Create an Auto Scaling Group
    const autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      instanceType: new ec2.InstanceType(instanceType.valueAsString),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      spotPrice: spotPrice.valueAsString,
      associatePublicIpAddress: true,
      desiredCapacity: serverState.valueAsString === 'Running' ? 1 : 0,
      minCapacity: serverState.valueAsString === 'Running' ? 1 : 0,
      maxCapacity: serverState.valueAsString === 'Running' ? 1 : 0,
    });

    // Create an Auto Scaling Group Capacity Provider
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      autoScalingGroup,
    });
    cluster.addAsgCapacityProvider(capacityProvider);

    // Create an EFS FileSystem
    const fileSystem = new efs.FileSystem(this, 'EfsFileSystem', {
      vpc,
    });

    const hostMountPoint: ecs.Host = {
      sourcePath: "/opt/minecraft",
    };

    // Create an ECS Volume
    const volume: ecs.Volume = {
      name: "minecraft-volume",
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
      }
    };

    // Create an ECS EC2 Task Definition
    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDef', {
      networkMode: ecs.NetworkMode.AWS_VPC,
      volumes: [volume]
    });

    // Create the container definition
    const container = taskDefinition.addContainer('minecraft', {
      image: ecs.ContainerImage.fromRegistry(`itzg/minecraft-server:${minecraftImageTag}`),
      memoryReservationMiB: 1024,
      environment: {
        'EULA': "TRUE",
        'TYPE': minecraftTypeTag.valueAsString,
        'OPS': adminPlayerNames.valueAsString,
        'DIFFICULTY': difficulty.valueAsString,
        'WHITELIST': whitelist.valueAsString,
      }
    });

    // Create an ECS MountPoint
    const mountPoint: ecs.MountPoint = {
      containerPath: "/data",
      sourceVolume: volume.name,
      readOnly: false,
    };

    // Add the mount point to the container
    container.addMountPoints(mountPoint);

    // Open ports to the container
    container.addPortMappings(
      {
        containerPort: 25565,
        hostPort: 25565,
        protocol: ecs.Protocol.TCP,
      },
    );

    // Start the EC2 Service
    const service = new ecs.Ec2Service(this, 'EC2Service', {
      cluster,
      taskDefinition,
    });

    // Allow Minecraft connections
    service.connections.allowFromAnyIpv4(Port.tcp(25565));

    // Allow ssh if your ipv4 address was provided
    if (!yourIPv4.valueAsString) {
      service.connections.allowFrom(
        Peer.ipv4(`${yourIPv4.valueAsString}/32`),
        Port.tcp(22)
      );
    }

    new cdk.CfnOutput(this, "CheckInstanceIp", {
      value: `https://${service.env.region}.console.aws.amazon.com/ec2/v2/home?region=${service.env.region}#Instances:tag:aws:autoscaling:groupName=${autoScalingGroup.autoScalingGroupName};sort=tag:Name`,
      description: "To find your Minecraft instance IP address, visit the following link. Click on the instance to find its Public IP address."
    });
  }
}
