# Vaultix: resumen para el pitch

Base para los videos y la presentación. Los números del protocolo salen de la `Config` del contrato en devnet; si cambian ahí, actualizalos acá.

**En una línea:** un link de pago protegido para comprar y vender por Instagram, WhatsApp o Marketplace. La plata queda en una bóveda hasta que el producto llega.

**El gancho:** "No custodiamos un peso: el código hace de intermediario. El fraude deja de ser negocio."

## Problema

En la compraventa entre particulares nadie confía en nadie:

- Si el **comprador** paga primero, se arriesga a no recibir nada.
- Si el **vendedor** envía primero, se arriesga a un comprobante de transferencia falso, una estafa muy común en Argentina.
- Hoy las alternativas son Mercado Libre, con comisiones altas, o encontrarse en persona, que no sirve a distancia y es inseguro.

## Solución

1. El vendedor crea un **link de pago** en un minuto (fotos, título y precio) y lo comparte por el chat de siempre.
2. El comprador paga y la plata entra a una **bóveda en la blockchain**. No la tiene el vendedor, ni el comprador, ni Vaultix.
3. El vendedor despacha y carga el número de seguimiento.
4. El comprador confirma que le llegó y el vendedor cobra. Si nadie hace nada, los plazos resuelven solos.
5. Si hay un problema, se abre un **reclamo con reglas claras**, que se muestran antes de pagar.

## Beneficios

- **Para el comprador:** si el vendedor no despacha en 5 días, recupera el 100%. Tiene 7 días desde el despacho para revisar y reclamar.
- **Para el vendedor:** se terminan los comprobantes falsos, porque ve el pago en bóveda antes de despachar. Cobra al instante si el comprador confirma, y solo, al vencer el plazo, si no confirma.
- **Las mismas reglas para los dos**, escritas en código: nadie las cambia a mitad de camino.
- **Fácil para quien no sabe de cripto:** entra con email o Google, no tiene palabras secretas que guardar y nunca necesita SOL para las comisiones de red. Solo USDC, el "dólar digital".
- **Verificable:** cada operación queda registrada en la blockchain.
- **Fraude caro:** abrir un reclamo cuesta un depósito del 5%, que se pierde si el reclamo no prospera.

## Modelo de negocio

- **1,5% por operación cerrada**, que paga el vendedor y solo cuando cobra. Si se cancela o se reembolsa, no se cobra nada.
- Muy por debajo de las comisiones de Mercado Libre. Para la diapositiva, poné la cifra actual de ML de la categoría que muestres, así el contraste se ve.
- **A futuro:** suscripción para vendedores frecuentes, y comisión en la carga de saldo o el on-ramp.
- **Nicho inicial:** productos de valor medio-alto entre gente que ya usa cripto, como zapatillas, celulares, consolas y ropa de marca. Primeros vendedores: una marca de ropa propia y la comunidad tech local.

## Lo que tiene HOY

Funcionando en Solana devnet, la red de prueba, en **vaultixpay.vercel.app**:

- **Login** con email, Google, Apple o Phantom. Cada usuario tiene su cuenta y Vaultix paga las comisiones de red.
- **El ciclo completo, probado de punta a punta:** crear el link, pagar, despachar con seguimiento, confirmar y cobrar.
- **Plazos automáticos:** reembolso si no despacha y cobro automático diario si nadie reclama.
- **Reclamos con árbitro:** las dos partes suben pruebas y el árbitro reembolsa, libera o reparte la plata.
- **"Mis operaciones":** compras y ventas con un ícono y un color por estado, que se actualizan solas sin recargar.
- **Cuenta:** saldo, dirección con QR para cargar, retiro a otras apps y el método con el que entraste.
- **Avisos por mail** de cada evento. Hoy llegan solo a la cuenta del equipo, porque falta un dominio propio.
- **Tutorial de carga de saldo** en la landing.

## Roadmap

1. **Plata real (mainnet-beta)**, con tope bajo por operación al principio. Detalle en `docs/mainnet-checklist.md`.
2. **Cargar saldo desde cualquier red** (Stellar, Base, Polygon…): la bóveda sigue en Solana y Vaultix convierte el depósito solo, con el protocolo oficial de Circle (CCTP). Así sirve Lemon o cualquier app.
3. **On-ramp integrado:** comprar USDC con pesos o tarjeta sin salir de Vaultix.
4. **Seguimiento obligatorio y automático** con las APIs de los correos, y **plazo de reclamo de 3 días desde la entrega** en lugar de 7 desde el despacho.
5. **Más confianza:** verificación por teléfono o DNI, reputación visible y bloqueo de compradores con reclamos falsos.
6. **Reclamos descentralizados:** árbitros externos y un plazo máximo de resolución.
7. **Dominio propio:** mails para todos los usuarios y links cortos (`vaultix.app/p/k3n9x`).

Detalle técnico de los puntos 2 y 4 en la sección Roadmap del `README.md`.

## Si el jurado pregunta

- **"¿No custodian nada? ¿Y el árbitro?"** Vaultix no tiene la plata, pero hoy el árbitro de los reclamos es el equipo. El árbitro solo puede repartir entre comprador y vendedor; no puede llevársela. Descentralizarlo está en el roadmap.
- **"¿Y si el comprador no tiene USDC?"** Lo compra en Bitso u otra app que envíe por Solana (tutorial en la landing). El on-ramp integrado y la carga desde cualquier red están en el roadmap.
- **"¿Y si el envío tarda más de 7 días?"** El plazo cubre los envíos dentro del país. Con el seguimiento automático, el plazo va a correr desde la entrega.
- **"¿Por qué blockchain?"** Porque la plata no la tiene nadie: la retiene un programa con reglas públicas. Eso baja el riesgo regulatorio y hace que cada operación sea verificable.
