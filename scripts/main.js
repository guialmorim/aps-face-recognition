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
			'Por favor, faça o upload de uma imagem para realização da biometria!'
		);

	const image = await faceapi.bufferToImage(uploadedImage);

	const displaySize = calculateAspectRatioFit(
		image.width,
		image.height,
		300,
		300
	);

	image.width = displaySize.width;
	image.height = displaySize.height;

	// Limpa a imagem e o canvas
	canvasWrapper.innerHTML = '';

	canvasWrapper.append(image);

	const canvas = faceapi.createCanvasFromMedia(image);

	canvasWrapper.append(canvas);

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
	toggleDisabledInputs();

	const feedbackSpan = document.createElement('span');
	feedbackSpan.innerText = 'Carregando Modelos.';
	loadingElement.appendChild(feedbackSpan);

	const labeledFaceDescriptors = await loadLabeledImages();
	faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);

	loadingElement.innerText = 'Modelos Carregados.';

	toggleDisabledInputs();
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
		//console.log(result);

		const { status, message } = handleAuthUser(loginObject, result);

		if (status === 401) showAlert(message, 'warning');
		if (status === 200) showAlert(message, 'success', 'Sucesso!');
	} catch (error) {
		showAlert(error.message, 'error');
	}
}

function handleAuthUser(loginObject, result) {
	if (result.length > 1)
		throw new Error(
			'Por favor, faça o upload de uma imagem com apenas um rosto!'
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
		return {
			status: 200,
			message: `Acesso Permitido. Bem-vindo, ${employee.name}!`,
		};
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

function toggleDisabledInputs() {
	const username = document.getElementById('login');
	const password = document.getElementById('password');

	if ($(username).attr('disabled')) {
		$(username).attr('disabled', false);
	} else {
		$(username).attr('disabled', true);
	}

	if ($(password).attr('disabled')) {
		$(password).attr('disabled', false);
	} else {
		$(password).attr('disabled', true);
	}
}

function calculateAspectRatioFit(srcWidth, srcHeight, maxWidth, maxHeight) {
	var ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);

	return { width: srcWidth * ratio, height: srcHeight * ratio };
}
