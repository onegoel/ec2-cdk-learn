import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2'; 
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets'; 
import * as keypair from 'cdk-ec2-key-pair';
import * as path from 'path';
 

export class Ec2CdkLearnStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Look up the default VPC
        const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
            // isDefault: true,
            vpcId: 'vpc-0b5a033a73eb89ff1'
        }); 


        // Create a key pair
        const key = new keypair.KeyPair(this, 'KeyPair', {
            name: 'ec2-cdk-learn-key',
            description: 'Key pair for ec2-cdk-learn',
        });
        key.grantReadOnPublicKey;

        // Create a security group
        const securityGroup = new ec2.SecurityGroup(this, 'ec2-web-app', {
            vpc,
            allowAllOutbound: true,
            description: 'Allow HTTP (80) and SSH (22) access to ec2 instances',
        });

        // Allow HTTP (80) and SSH (22) access to ec2 instances
        securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP access from the Internet');
        securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH access from the Internet');

        // Create an IAM role for the EC2 instance
        const role = new iam.Role(this, 'ec2-web-app-role', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2RoleforSSM'),
            ],
        });

        // Look up the AMI Id for the Amazon Linux 2 Image with CPU Type X86_64
        const ami = new ec2.AmazonLinuxImage({
            generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
            cpuType: ec2.AmazonLinuxCpuType.X86_64,
        });

        // Create the EC2 instance using the Security Group, AMI, and KeyPair defined.
        const ec2Instance = new ec2.Instance(this, 'Instance', {
            vpc,
            instanceType: ec2.InstanceType.of(
                ec2.InstanceClass.T2,
                ec2.InstanceSize.MICRO
            ),
            machineImage: ami,
            securityGroup: securityGroup,
            keyName: key.keyPairName,
            role: role,
        });

        // Create a S3 bucket to store the web app files
        const sampleAppBucket = new s3assets.Asset(this, 'SampleAppBucket', {
            path: path.join(__dirname, '../sample-python-web-app'),
        });

        // Allow the EC2 instance to read the S3 bucket
        sampleAppBucket.grantRead(role);

        // Download the S3 bucket files to the EC2 instance
        const sampleAppFilePath = ec2Instance.userData.addS3DownloadCommand({
            bucket: sampleAppBucket.bucket,
            bucketKey: sampleAppBucket.s3ObjectKey,
        });

        /** Sample App */

        // Upload config file to the S3 bucket
        const configScript = new s3assets.Asset(this, 'ConfigScript', {
            path: path.join(__dirname, '../sample-python-web-app/configure_amz_linux_sample_app.sh'),
        });

        // Allow the EC2 instance to read the S3 bucket
        configScript.grantRead(role);

        // Download the S3 bucket files to the EC2 instance
        const configScriptFilePath = ec2Instance.userData.addS3DownloadCommand({
            bucket: configScript.bucket,
            bucketKey: configScript.s3ObjectKey,
        });

        // Run the config script
        ec2Instance.userData.addExecuteFileCommand({
            filePath: configScriptFilePath,
            arguments: `${sampleAppFilePath} ${ec2Instance.instancePublicIp}`,
        });

        // Create outputs for connecting

        // Output the public IP address of the EC2 instance
        new cdk.CfnOutput(this, 'IP Address', {
            value: ec2Instance.instancePublicIp,
        });

        // Command to download the SSH key
        new cdk.CfnOutput(this, 'Download Key Command', {
            value:
          'mkdir -p ~/.ssh \
          && aws secretsmanager get-secret-value \
            --secret-id ec2-ssh-key/cdk-keypair/private \
            --query SecretString \
            --output text > ~/.ssh/ec2-cdk-key.pem \
            && chmod 600 ~/.ssh/ec2-cdk-key.pem',
        });

        // Command to access the EC2 instance using SSH
        new cdk.CfnOutput(this, 'Ssh Command', {
            value:
          'ssh -i ~/.ssh/ec2-cdk-key.pem -o IdentitiesOnly=yes ec2-user@' +
          ec2Instance.instancePublicIp,
        });
    }
}
