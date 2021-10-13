const imageUpload = document.getElementById('imageUpload');
const loadingElement = document.getElementById('loading');
const canvasWrapper = document.getElementById('canvasWrapper');
const container = document.getElementById('container');

let faceMatcher = null;

Promise.all([
	faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
	faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
	faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
]).then(main);

async function handleImageSubmitted() {
	const uploadedImage = imageUpload.files[0];

	if (!uploadedImage)
		throw new Error(
			'Por favor, faça o upload de uma imagem para realização da biometria'
		);

	const image = await faceapi.bufferToImage(uploadedImage);

	// Limpa a imagem e o canvas
	canvasWrapper.innerHTML = '';

	canvasWrapper.append(image);

	const canvas = faceapi.createCanvasFromMedia(image);

	canvasWrapper.append(canvas);

	const displaySize = { width: image.width, height: image.height };

	faceapi.matchDimensions(canvas, displaySize);

	const detections = await faceapi
		.detectAllFaces(image)
		.withFaceLandmarks()
		.withFaceDescriptors();

	const resizedDetections = faceapi.resizeResults(detections, displaySize);

	const results = resizedDetections.map((d) =>
		faceMatcher.findBestMatch(d.descriptor)
	);

	results.forEach((result, index) => {
		const box = resizedDetections[index].detection.box;

		const newFormattedResultObject = handleFormatResultObject(result);

		const drawBox = new faceapi.draw.DrawBox(box, {
			label: newFormattedResultObject.toString(),
		});

		drawBox.draw(canvas);
	});

	return results;
}

function handleFormatResultObject(detectedFaces) {
	const { _label } = detectedFaces;

	const newLabel = _label === 'unknown' ? 'Usuário Desconhecido' : _label;

	detectedFaces._label = newLabel;

	return detectedFaces;
}

async function main() {
	loadingElement.innerText = 'Loading Models.';

	const labeledFaceDescriptors = await loadLabeledImages();
	faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);

	loadingElement.innerText = 'Loaded.';
}

async function loadLabeledImages() {
	const configuration = await readJson('config.json');

	return Promise.all(
		employees.map(async (employee) => {
			const descriptions = [];

			for (let i = 1; i <= configuration.numberOfFaces; i++) {
				const img = await faceapi.fetchImage(
					`/labeled_images/${employee.path}/${i}.jpg`
				);

				const detections = await faceapi
					.detectSingleFace(img)
					.withFaceLandmarks()
					.withFaceDescriptor();

				descriptions.push(detections.descriptor);
			}

			return new faceapi.LabeledFaceDescriptors(employee.name, descriptions);
		})
	);
}

async function submitForm(event) {
	event.preventDefault();

	const inputs = document.getElementById('loginForm').elements;

	const usernameInput = inputs['username'];
	const passwordInput = inputs['password'];

	const loginObject = {
		username: usernameInput.value,
		password: passwordInput.value,
	};

	try {
		const result = await handleImageSubmitted();
		console.log(result);

		const { status, message } = handleAuthUser(loginObject, result);

		loadingElement.innerText = message;

		if (status === 401) alert(message);
	} catch (error) {
		alert(error.message);
	}
}

function handleAuthUser(loginObject, result) {
	if (result.length > 1)
		throw new Error(
			'Por favor, faça o upload de uma imagem com apenas um rosto'
		);

	const employee = employees.find((e) => e.name === result[0].label);

	if (!employee)
		return { status: 401, message: 'Acesso Negado. Usuário não encontrado.' };

	if (employee.role !== roles.ADMIN)
		return { status: 401, message: 'Acesso requer elevação.' };

	if (
		employee.username === loginObject.username &&
		employee.password === loginObject.password
	) {
		return { status: 200, message: 'Acesso Permitido.' };
	}

	return { status: 401, message: 'Credenciais Incorretas.' };
}

async function readJson(fileName) {
	const json = await fetch(`settings/${fileName}`)
		.then((response) => response.json())
		.then((json) => json)
		.catch((error) => {
			throw new Error(error);
		});

	return json;
}
