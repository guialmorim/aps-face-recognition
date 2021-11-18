function showAlert(
	text,
	icon = 'warning',
	title = 'Atenção!',
	confirmButtonText = 'Ok!'
) {
	Swal.fire({
		text,
		icon,
		title,
		confirmButtonText,
	});
}
