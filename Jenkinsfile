// Declarative Jenkins pipeline for Skyline Air.
// Flow: GitHub -> test -> Docker image -> AWS ECR -> Minikube -> verify
pipeline {
    agent any

    environment {
        // >>>>>> CHANGE THESE TWO to match your AWS account <<<<<<
        AWS_ACCOUNT_ID = 'YOUR_12_DIGIT_AWS_ACCOUNT_ID'
        AWS_REGION     = 'ap-south-1'          // the region where you created the ECR repo

        APP_NAME     = 'skyline-air'
        ECR_REGISTRY = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
        IMAGE_NAME   = "${ECR_REGISTRY}/${APP_NAME}"
        IMAGE_TAG    = "v${BUILD_NUMBER}"      // v1, v2, v3 ... one tag per pipeline run
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    triggers {
        // Every 2 minutes Jenkins asks GitHub "any new commit?" and runs the pipeline if yes.
        pollSCM('H/2 * * * *')
    }

    stages {

        stage('Checkout') {
            steps {
                // Pull the latest code from the GitHub repo configured in the Jenkins job
                checkout scm
                sh 'ls -la'
            }
        }

        stage('Build and Test') {
            steps {
                // The site is static (nothing to compile), so the "build/test" step is
                // an automated check of the HTML structure, JavaScript syntax and flight data.
                sh '''
                    node --version
                    node tests/check.js
                '''
            }
        }

        stage('Docker Build') {
            steps {
                sh '''
                    docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -t ${IMAGE_NAME}:latest .
                    docker images ${IMAGE_NAME}
                '''
            }
        }

        stage('Push Image to ECR') {
            steps {
                // No password is stored anywhere: the EC2 server has an IAM role that allows ECR access.
                sh '''
                    aws sts get-caller-identity
                    aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}
                    docker push ${IMAGE_NAME}:${IMAGE_TAG}
                    docker push ${IMAGE_NAME}:latest
                    aws ecr describe-images --repository-name ${APP_NAME} --region ${AWS_REGION} --query "imageDetails[*].imageTags" --output json
                '''
            }
        }

        stage('Deploy to Minikube') {
            steps {
                // ECR is private, so Kubernetes needs a temporary login (valid ~12 hours) to pull the image.
                // "set +x" stops the token from being printed in the Jenkins log.
                sh '''
                    set +x
                    ECR_PASS=$(aws ecr get-login-password --region ${AWS_REGION})
                    kubectl create secret docker-registry ecr-secret \
                        --docker-server=${ECR_REGISTRY} \
                        --docker-username=AWS \
                        --docker-password="${ECR_PASS}" \
                        --dry-run=client -o yaml | kubectl apply -f -
                '''
                sh '''
                    # Put the real image name + tag into the Deployment, then apply it
                    sed "s|IMAGE_PLACEHOLDER|${IMAGE_NAME}:${IMAGE_TAG}|" k8s/deployment.yaml | kubectl apply -f -
                    kubectl apply -f k8s/service.yaml
                    # Wait until the new pods are running and ready
                    kubectl rollout status deployment/${APP_NAME} --timeout=180s
                '''
            }
        }

        stage('Verify') {
            steps {
                sh '''
                    echo "---- Deployment ----"
                    kubectl get deployment ${APP_NAME}
                    echo "---- Pods ----"
                    kubectl get pods -l app=${APP_NAME} -o wide
                    echo "---- Service ----"
                    kubectl get service ${APP_NAME}-service
                    echo "---- Image running in the cluster ----"
                    kubectl get deployment ${APP_NAME} -o jsonpath="{.spec.template.spec.containers[0].image}"
                    echo
                    echo "---- HTTP check against the Service ----"
                    MINIKUBE_IP=$(minikube ip)
                    curl -sf --retry 5 --retry-delay 3 --retry-connrefused http://${MINIKUBE_IP}:30080/ | grep -o "<title>[^<]*</title>"
                    curl -s http://${MINIKUBE_IP}:30080/ | grep -o "Version [0-9]*" | head -1
                '''
            }
        }
    }

    post {
        success { echo "SUCCESS: ${IMAGE_NAME}:${IMAGE_TAG} is deployed. Open http://<EC2-public-IP>/ in your browser." }
        failure { echo 'FAILED: open the red stage in Stage View and read its log.' }
        always  { sh 'docker logout ${ECR_REGISTRY} || true' }
    }
}
