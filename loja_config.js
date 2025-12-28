// ARQUIVO DE CONFIGURAÇÃO DA LOJA
// Aqui ficam apenas os dados que mudam de cliente para cliente.

module.exports = {
    // DADOS DA EMPRESA
    nomeLoja: "Dona Baguete",
    mensagemSaudacao: "O Melhor Lanche de Conchas-SP",
    taxaEntrega: 4.00,
    
    // DADOS PIX
    pixChave: "14981244330",
    pixNome: "Daniela Carolina Alves Ribeiro",

    // CARDÁPIO (A Pizzaria teria pizzas aqui, você tem lanches)
    menu: {
        1: { tipo: 'lanche', titulo: "Combo Costela Especial", descricao: "Baguete c/ costela, batata 120g, coca 220ml", preco: 36.90 },
        2: { tipo: 'lanche', titulo: "Combo Frango Cremoso", descricao: "Baguete c/ frango, batata 120g, coca 220ml", preco: 33.90 },
        3: { tipo: 'lanche', titulo: "Combo Clássico Pernil", descricao: "Baguete c/ pernil, batata 120g, coca 220ml", preco: 31.90 },
        4: { tipo: 'lanche', titulo: "Baguete de Costela", descricao: "Só o lanche de Costela", preco: 24.90 },
        5: { tipo: 'lanche', titulo: "Baguete de Frango", descricao: "Só o lanche de Frango", preco: 21.90 },
        6: { tipo: 'lanche', titulo: "Baguete de Pernil", descricao: "Só o lanche de Pernil", preco: 19.90 },
        7: { tipo: 'bebida', titulo: "Coca-Cola Lata 220ml", preco: 5.00 },
        8: { tipo: 'bebida', titulo: "Refrigerante Lata 350ml", preco: 6.00 },
        9: { tipo: 'bebida', titulo: "Água", preco: 3.00 }
    },

    // ADICIONAIS
    adicionais: {
        1: { nome: "Bacon Extra", preco: 5.00 },
        2: { nome: "Catupiry Original", preco: 5.00 },
        3: { nome: "Queijo Extra", preco: 4.00 },
        4: { nome: "Repolho c/ Maionese", preco: 2.00 }
    }
};