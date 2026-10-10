Infraestructura de conciliación y pagos para el departamento de Cuentas por Pagar para empresas (B2B) en el sector de logística en transacciones internacionales. 
Se hará uso de la API de Reap y de protocolo Agent Payments Protocol. Se usaran diversos documentos y se transformarán en mandatos criptográficos haciendo uso del protocolo Agent Payments Protocol (AP2). 
La empresa compradora hara uso del documento de Orden de Compra (PO) y se transformaŕa  en un mandato criptográfico, del lado del proveedor emitirá una factura que también se volverá otro mandato criptográfico. Posteriormente se verificará que ambos documentos o mandatos criptográficos coincidan, en caso de coincidir existe un scope disponible para una persona donde saldrá un mensaje que diga "Pago autorizado" y el pago se ejecutará. En caso de que los 2 documentos no coincidan se enviará al scope un mensaje que diga "Advertencia. Facturas no coinciden". Esto permitirá una revisión o conciliación manual, cuando las facturas no coinciden aparacerá un botón que diga "Facturas revisadas", se hará click y se podrá autorizar el pago. En todos los casos saldrán dos boton más al final, uno que diga "Autorizar Pago" y "Rechazar Pago". En caso de coincidir los documentos ambos botones, tanto el de Autorizar Pago como el de Rechazar Pago estarán disponibles, en el otro caso donde haya una discrepancia y hasta que no sea resuelta mediante el botón "Advertencia. Facturas no coinciden" se podrá activar de nuevo el botón "Autorizar Pago". Para autorizar los pagos es necesario en cualquier caso que coincidan los documentos Orden de Compra (PO) y Factura. Se usará en este punto la API de Reap para generar la tarjeta temporal y realizar el pago. 

Documentación para consulta:

	Condiciones del hackathon:	
		https://aibuilders.mx/reap

	Documentación API Reap:
		https://docs.reap.global/

	Documentación Protocolo AP2:
		https://ap2-protocol.org/

	Merchant:
		https://acteck.com/
	
