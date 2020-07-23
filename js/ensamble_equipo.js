// Vars globales
var selectedFailures = ['Failure 3', 'Failure 12'];
const sizeSkillReqs = { width: 750, height: 400};
const margin = { top: 30, bottom: 30, left: 20, right: 20 };
var failuresSkills, peopleSkills, failuresPeople;
var teamSize = 0;
const carouselClass = "carouselTeam";
const carouselCellClass = "carouselTeam-cell";

$(document).ready(function() {

    // Slider del equipo
    const valueSpan = $('#teamSizeSpan');
    const teamSlider = $('#teamSlider');
    teamSize = teamSlider.val();
    valueSpan.html(teamSize);
    teamSlider.on('input change', () => {
        teamSize = teamSlider.val();
        valueSpan.html(teamSize);
        updateTeam();
    });

    // Evento guardar fallas seleccionadas
    $('#edit-failures-submit').on('click', function(d) {
        selectedFailures = $('#selected-failures').val();
        $('#edit-failures-modal').modal('hide');
        updateSelectedFailures();
    });

  });



// Carga de datos
Promise.all([
    d3.csv("data/personas_skills_wide.csv"), 
    d3.csv("data/failure_persona_score.csv"),
    d3.csv("data/problemas_skills.csv")
]).then( function (data) {
    // Skills de las personas
    peopleSkills = data[0].map( function(d) {
        const skills = [];
        Object.keys(d).forEach( k => {
        if (k != "Persona")
            skills.push({'axis': k, 'name': k, 'value': parseFloat(d[k])});
        });
        return {
            'nombre': d.Persona,
            'datos': skills
        }
    });

    // Scores de las Personas
    failuresPeople = data[1].map( function(d) {
        const personas = [];
        Object.keys(d).forEach( k => {
        if (k != "Failure")
            personas.push({'persona': k, 'value': parseFloat(d[k])});
        });
        return {
        'failure': d.Failure,
        'personas': personas
        }
    });
    
    // Fallas y skills
    failuresSkills = data[2].map( function(d) {
        const skills = [];
        Object.keys(d).forEach( k => {
        if (k != "Failure")
            skills.push({'skill': k, 'value': parseInt(d[k])});
        });
        return {
        'failure': d.Failure,
        'skills': skills
        }
    });

    // Fallas
    const failures = failuresSkills.map( d => d.failure );

    // Failures form (modal)
    var formFailures = ' \
        <label for="selected-failures">Seleccionar las fallas</label> \
        <select multiple class="form-control" id="selected-failures"> \
    ';
    failures.forEach(function(f) {
        formFailures += `<option value="${f}">${f}</option>`
    });
    $('#edit-failures-modal .modal-body .form-group').html(formFailures + '</select>');


    updateSelectedFailures();
  });

// Actualiza fallas seleccionadas/detectadas
updateSelectedFailures = function() {
    var selectedDivs = '';
    selectedFailures.forEach(function(f) {
        // Selecciona las fallas en el form de la modal
        $(`#selected-failures option[value="${f}"]`).attr('selected','selected');

        // Agrega las fallas en el box de seleccionadas
        selectedDivs += `<div class="p-1 m-1 d-inline-block bg-info">${f}</div> `;
    });
    $('.failure-selection').html(selectedDivs);

    // Contador de fallas detectadas
    $('#detected-failures-count').html(selectedFailures.length);

    // Dibuja skills reqs
    drawSkillReqs();

    // Conformacion del grupo segun size y fallas, y actualiza charts
    updateTeam();
}


// Actualiza el equipo seleccionado
updateTeam = function() {
    // Conformacion del grupo segun size y fallas
    const groupSkills = createGroup(teamSize, selectedFailures, failuresPeople, peopleSkills);

    // Dibuja chart team
    drawTeamSkills(groupSkills);

    // Dibuja el carousel
    drawCarousel(groupSkills);

    // Cobertura de skills
    updateCoverageNotification(groupSkills);
}


// Filtrado de skills segun las fallas seleccionadas
failureSkillReqs = function(failures) {
    const data = failuresSkills
    .filter( item => (failures.includes(item.failure)) )
    .map( d => d.skills)
    .flat()

    // Retorna el listado de skills agrupados y sumarizados segun las fallas
    return d3.nest()
    .key( d => d.skill)
    .rollup( d => d3.max(d, g => g.value) )
    .entries(data)
    .map( function(d) {
    return { skill: d.key, value: d.value };
    });
}  


// Creacion del equipo
createGroup = function(groupSize, failures, failuresPeople, personSkills) {
    // Se filtran las fallas y se obtienen las 40 personas rankeadas
    const rankedPeople = rankPeopleFailures(failuresPeople, failures);
    
    // El grupo se genera con las top 'groupSize' personas rankeadas
    const group = rankedPeople.slice(0, groupSize)
    // Se incorporan los skills de las personas del grupo
      .map( p => ({
          nombre: p.nombre,
          max_score: p.max_score,
          skills: personSkills.find( ps => ps.nombre == p.nombre ).datos
        }) 
      );
    
    return group;
}

// Ranking de mejores personas segun fallas
rankPeopleFailures = function(failuresPeople, failures) {
    const data = failuresPeople.map(function(f) {
      // Se ordenan las personas segun score en cada falla
      return {
        failure: f.failure,
        personas: f.personas.sort( (x, y) => d3.descending(x.value, y.value) )
      }
    })
    // Se filtran las fallas seleccionadas
    .filter( item => (failures.includes(item.failure)) )
    
    // Se descartan los campos de fallas y se aplanan las personas con su score
    .map( f => f.personas )
    .flat()
    
    // Se ordena nuevamente por score (resulta en una lista de las personas ordenadas por score)
    .sort((x, y) => d3.descending(x.value, y.value) )
    
    // Posible mejora: en lugar de ordenar por score general, intercalar los scores de las fallas seleccionadas.
    // Esto se tendria que hacer antes del .flat()
  
    // Se agrupa por persona para quedarnos con el score mas alto de cada una (resulta en lista de las 40 personas)
    return d3.nest()
      .key( d => d.persona)
      .rollup( d => d3.max(d, g => g.value) )
      .entries(data)
      .map( d => ({ nombre: d.key, max_score: d.value }) );
}

teamCoverage = function(team, failures) {
    // Dado un equipo formado y las fallas, se determina si cubre todos los skills requeridos y se devuelven los sobrantes
    
    // Skills de todas las personas del equipo
    const teamSkills = team.map( d => d.skills).flat();
    
    // Se agrupan por skill y se selecciona el maximo valor de cada skill
    const teamMaxSkills =  d3.nest()
      .key( d => d.name)
      .rollup( d => d3.max(d, g => g.value) )
      .entries(teamSkills)
      .map( d => ({ name: d.key, max_value: d.value }) );
    
    // Valores de skills requeridos segun fallas seleccionadas
    const skillsReqs = failureSkillReqs(failures);
    
    // Arreglo de skills con diferencia entre valores provistos y requeridos
    const skillsDiff = teamMaxSkills.map( function(ts) {
      return ts.max_value - skillsReqs.find(sr => sr.skill == ts.name).value;
    });
    
    return {
        'coverage': skillsDiff.find( x => x < 0) ? false : true,    // True si hay algun valor negativo
        'overallocation': d3.sum(skillsDiff),
        'missing_skills': skillsDiff.map( function(v, i) {
          if (v < 0) {
            const skill = teamMaxSkills[i];
            skill.req_value = skillsReqs.find(sr => sr.skill == skill.name).value
            return skill;
          }
        }).filter(x => x),
        'diff_values': skillsDiff
    };
}


/* **************** */
/* Chart Skill Reqs */
/* **************** */

// Dibujar chart de skillsReqs
drawSkillReqs = function() {
    d3.select('#skills-reqs-canvas').select('div').remove();
    d3.select('#skills-reqs-canvas')
    .append('div')
    .classed("svg-container", true) 
    .append("svg")
    .attr("preserveAspectRatio", "xMinYMin meet")
    .attr("viewBox", [0, 0, sizeSkillReqs.width, sizeSkillReqs.height])
    .classed("svg-content-responsive", true);

    const svg = d3.select('#skills-reqs-canvas').select('svg');

    // Se define un tamaño menor para dejar lugar a leyendas
    const innerSize = sizeSkillReqs.height - margin.top - margin.bottom;

    // Centro del canvas
    const center = {'x': sizeSkillReqs.width / 2, 'y': sizeSkillReqs.height / 2};

    // Se dibuja el bg
    svg.call(drawSkillsBg ,innerSize, 10, center);

    // Se dibujan los skills
    svg.call(drawSkillsReqs, 'Radio', innerSize, selectedFailures, center);

    // Se agrega el tooltip del arco
    svg.call(addArcTooltip);
}

// Genera circulos del Bg
skillReqsBgCircles = function*(size, levels) {
    const linearScale = d3.scaleLinear()
      .domain([0, levels])
      .range([0, size / 2]);
    
    // Generacion de circulos
    for (let i = 1; i <= levels; i++) {
      yield {'x': 0,
              'y': 0,
              'radio': linearScale(i)
             };
    }
} 

// Dibuja el Bg del skillsReqs
drawSkillsBg = function(svg, size, levels, center) {
    // Generamos grupo de bg
    const skillBgGroup = svg.append("g").attr("transform", `translate(${center.x}, ${center.y})`);
    
    // Generamos los circulos de bg
    skillBgGroup.selectAll("circle")
      .data(Array.from(skillReqsBgCircles(size, levels)))
      .enter()
      .append("circle")
      .attr("class", "bg-circle")
      .attr("cx", d => d.x )
      .attr("cy", d => d.y )
      .attr("r" , d => d.radio );
}

// Dibuja los skills requeridos
drawSkillsReqs = function(svg, skillRepr, size, failures, center) {
    // Se generan los datos de los skills para los arcos
    const arcData = arcSkillsData(failureSkillReqs(failures), skillRepr, size);
    
    // Padding para alejar el label de skills del circulo
    const textPad = 1.1;
  
    // Generador de arcos
    const arcGenerator = d3.arc()
      .innerRadius(0)
      .padAngle(0)
      .cornerRadius(size * 0.015);
    
    // Generamos el grupo de arcos
    const skillReqsGroup = svg.append("g").attr("transform", `translate(${center.x}, ${center.y})`);
    
    // Dibuja los arcos de los skills
    skillReqsGroup.selectAll('path')
        .data(arcData)
        .enter()
        .append('path')
      .attr('class', 'skill-arc')
        //.attr('d', arcGenerator)      // Se comenta xq se dibujan los arcos con transicion
      .attr('stroke-width', size * 0.002)
      .attr('fill', d => d3.color(d.fillColor).brighter(2));
  
    // Transicion de arcos
    skillReqsGroup.selectAll('path')
      .data(arcData)
      .transition()
      .duration(750)
      .ease(d3.easeCubicOut)
      .delay(100)
      .attr('fill', d => d.fillColor)
      .attrTween( 'd', function(data) {       // Funcion custom para generar arcos cada vez mas grandes
      // Interpolador de radio
      const radiusInter = d3.interpolate(0, data.outerRadius);
      // Funcion de transicion de atributo 'd' de cada obj path (t es instante de tiempo de la transicion en [0,1])
      return function(t) {
        // Se clona el dato del arco (se dibujan multiples arcos en cada t, cada uno con su outerRadius)
        const tmpArc = JSON.parse(JSON.stringify(data));
        // Se define el outerRadius de este instante t
        tmpArc.outerRadius = radiusInter(t);
        // Retorna el atributo 'd' del objeto path (arco del chart)
        return arcGenerator(tmpArc);
      }
    });
    
    // Dibuja los separadores
    skillReqsGroup.selectAll('line')
      .data(arcData)
        .enter()
        .append('line')
      .attr('class', 'skill-separator')
      .attr('stroke-width', size * 0.001)
      .attr('x1', 0)  // El grupo ya tiene el translate al centro
      .attr('y1', 0)  
      .attr('x2', d => Math.cos(d.startAngle - Math.PI / 2) * size / 2 * textPad)
      .attr('y2', d => Math.sin(d.startAngle - Math.PI / 2) * size / 2 * textPad);
    
    // Dibuja los labels de los skills
    skillReqsGroup.selectAll('text')
      .data(arcData)
      .enter()
      .append('text')
    .attr('class', 'skill-label')
      .each(function(d) {
      // Se calcula el angulo de la posicion del label
      const angle = d.startAngle + (d.endAngle - d.startAngle) / 2 - Math.PI / 2;
      
          d3.select(this)
        .attr('transform', `translate(${Math.cos(angle) * textPad * size / 2}, 
                                      ${Math.sin(angle) * textPad * size / 2})`)
        //.style('font-size', `${size * 0.025}px`)       // Font size del label
              .text(d.skill);
      });
}

// Genera los datos de los arcos
arcSkillsData = function(skills, skillRepr, size = 1) {
    // Se filtran skills en 0
    const filtered = skills.filter( item => item.value > 0 );
    
    // Se calculan los angulos
    const arcAngle = 2 * Math.PI / filtered.length;
    
    // Paleta de colores categorica
    const catPalette = d3.schemeSet3;
    
    // Escala del tamaño de los arcos
    const outerRadiusMap = {
       // Escala del tamaño de los arcos con el radio como valor del skill
      'Radio': value => 
              d3.scaleLinear()
                      .domain([0, 10])     // Se puede usar d3.max(skills.map( d => d.value )) como max
                      .range([0, size / 2])(value),
       // Escala del tamaño de los arcos con el area como valor del skill
      'Area': value =>
              Math.sqrt(d3.scalePow()
                          .domain([0, 10])    // Se puede usar d3.max(skills.map( d => d.value )) como max
                          .range([0, Math.pow(size / 2, 2) * arcAngle / 2])(value) / arcAngle * 2)
    }
    
    // Escala el color de los arcos (segun valor)
    const scaleColor = d3.scaleLinear()
      .domain([0, d3.max(skills.map( d => d.value )) ])
      .range([1, 0]);
    
    filtered.map( (d, i) => {
      d['startAngle'] = i * arcAngle;
      d['endAngle'] = (i + 1) * arcAngle;
      d['outerRadius'] = outerRadiusMap[skillRepr](d.value);
      //d['outerRadius'] = Math.sqrt(scaleArea(d.value) / arcAngle * 2);  // Utilizando area del arco como valor
      //d['fillColor'] = d3.interpolateSpectral(scaleColor(d.value)); // Colores segun valor
      d['fillColor'] = catPalette[i % catPalette.length]; // Colores segun skill (categorica)
    });
    return filtered;
}

// Agrega tooltip
addArcTooltip = function(svg) {
    // Tooltip del arco
    d3.select("body").append("div")
      .attr("class", "arc-tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden");
    
    // Eventos para mostrar tooltip
    svg.selectAll("path") 
      .on("mouseover", function(){
        // Muestra tooltip al posicionarse sobre el arco
        d3.select(".arc-tooltip").style("visibility", "visible");
        // Oscurece el color del arco para diferenciarlo
        d3.select(this).style('fill', d3.color(d3.select(this).style('fill')).darker(1));
      })
      .on("mousemove", function(d){
      // Configura tooltip con los datos del skill al posicionarse sobre el arco
        d3.select(".arc-tooltip")
          .style("top", (d3.event.pageY - 10) + "px")
          .style("left",(d3.event.pageX + 10) + "px")
          .text('Name: ' + d.skill +
                '\nValue: ' + d.value);
      })
      .on("mouseout", function(){
        // Esconde tooltip al salir del arco
        d3.select(".arc-tooltip").style("visibility", "hidden");
        // Restablece al color original
        d3.select(this).style('fill', d3.color(d3.select(this).style('fill')).brighter(1));
      });
}


/* **************** */
/* Chart Skill Team */
/* **************** */

drawTeamSkills = function(groupSkills) {
    // Config del layout del polar chart
    const layout = {
      width: sizeSkillReqs.width,
      height: (sizeSkillReqs.width / 3) * 2,
      polar: {
        angularaxis: {
          linewidth: 1,
          color: 'grey',
          showline: false,
          direction: "clockwise",
        },
        radialaxis: {
          gridcolor: 'white',
          gridwidth: 2,
          visible: true,
          range: [0, 10], // rango de 0 a 10 de las habilidades
          color: 'gray',
          showline: false
        },
        bgcolor: 'rgb(245,245,245)' // color de fondo
      }
    };
    
    d3.select('#skills-team-canvas').select('div').remove();
    const div = d3.select('#skills-team-canvas').append('div');
    
    //= DOM.element('div');
    Plotly.newPlot('skills-team-canvas', chartData(groupSkills), layout, {displayModeBar: false});
    
    // TODO: Coloreo de skill labels segun cobertura
    //d3.selectAll('.angularaxistick').selectAll('text').style('fill','red');
}

// Datos para el chart
chartData = function(groupSkills) {
    // Datos del chart
    return groupSkills.map(d => ({
      type: 'scatterpolar',
      // Se agrega el skill 1 al final, para cerrar el poligono
      // Otra forma: r: d.skills.map(s => s.value).concat(d.skills[0].value),
      r: d.skills.map(s => s.value).concat(d.skills.map(s => s.value)[0]),
      // idem anterior. Agrega el label 'Skill 1' al final
      theta: d.skills.map(s => s.axis).concat(d.skills.map(s => s.axis)[0]),
      name: d.nombre,
      visible: d.nombre != 0 ? true : 'legendonly',
      opacity: 0.5,
      fill: "toself",
      line: {
        width: 2,
        shape: 'spline' // hace un smooth de la linea
        // color: 'red'
      },
      marker: {
        size: 8 // tamaño del punto (?)
      },
      // template html del tooltip
      hovertemplate: '<b>%{theta}</b>' + '<br>%{r:.2f}<br>' + "<extra></extra>"
    }));
  }


/* **************** */
/* Chart Carousel   */
/* **************** */
  
drawCarousel = function(groupSkills)  {
    // Tamaño de escena (recuadro frontal visible del carousel)
    const sceneSize = 240;
    
    // Creacion de la div de escena
    d3.select('#team-carousel-area').select('div').remove();
    d3.select('#team-carousel-area').append('div');
    const scene = d3.select('#team-carousel-area').select('div');
    scene
      .attr('class', 'scene')
      .style('width', sceneSize + 'px')
      .style('height', sceneSize + 'px');
    
    // Atributos iniciales del carousel
    const carouselAttrs = carouselAttributes(groupSkills.length, sceneSize);
      
    // Generacion del carousel, se agregan atributos que sirven para su manipulación dinámica
    const carousel = scene.append('div')
      .attr('class', carouselClass)
      .attr('cellSize', carouselAttrs.cellSize)
      .attr('cellCount', carouselAttrs.cellCount)
      .attr('angle', carouselAttrs.angle)
      .attr('radius', carouselAttrs.radius)
      .attr('selected-index', 0)
      .style('transform', `translateZ(-${carouselAttrs.radius}px)`)
    
    // Movimiento del carousel con drag
    var startDragX;
    carousel.call(d3.drag()
                    // Al momento de inicial el drag se guarda la posicion del mouse (sobre X)
                    .on("start", function() { startDragX = d3.event.x; })
                    // Durante el drag se rota el carousel, respecto al X original
                    .on("drag", function() {
                      const idx = parseInt(d3.select(this).attr('selected-index'));
                      var currentAngle = -d3.select(this).attr('angle') * idx + (d3.event.x - startDragX) / 2;
                      d3.select(this).style('transform', `translateZ(-${parseInt(carousel.attr('radius'))}px) rotateY(${currentAngle}deg)`);
                    })
                    // Al terminar el drag se posiciona el carousel en el índice más cercano
                    .on("end", function() {
                      if (d3.event.x != startDragX) {
                        var currentAngle = parseInt(d3.select(this).style('transform').match(/rotateY\((.*?)\)/)[1]);
                        currentAngle = Math.round(currentAngle - currentAngle % d3.select(this).attr('angle'));
                        carousel.attr('selected-index', Math.abs(Math.round(currentAngle / d3.select(this).attr('angle'))) % d3.select(this).attr('cellcount'));
                        d3.select(this).style('transform', `translateZ(-${parseInt(carousel.attr('radius'))}px) rotateY(${currentAngle}deg)`);
                      }
                    }));
    
    // Movimiento del carousel con la rueda del mouse
    carousel.on("wheel", function() {
        // Para evitar el scroll en pantalla
        d3.event.preventDefault();
        // Avanza en dirección respecto al movimiento de la rueda
        d3.select(this).call(rotateCarousel, d3.event.wheelDelta);
       });
  
    // Se inserta el carousel en la escena con sus celdas
    carousel.selectAll('div')
      .data(carouselData(groupSkills, sceneSize))
      .enter()
      .append('div')
      .attr('class', carouselCellClass)
      .attr('index', d => d.cellIndex)
      .style('width', d => d.cellWidth + 'px')
      .style('height', d => d.cellHeight + 'px')
      .style('transform', d => 'rotateY(' + d.cellAngle + 'deg) translateZ(' + d.cellRadius + 'px)')
      .attr('person', d => d.nombre)
      .html(d => htmlPersonCell(d))
      
      // Seleccion de persona (para resaltar en el polar chart)
      .on("click", function() {
          d3.select(this).call(togglePersonSelection);
        });
}

carouselData = function(groupSkills, sceneSize) {
    // Se obtienen atributos principales del carousel (seteados al inicializarlo)
    const carouselAttrs = carouselAttributes(groupSkills.length, sceneSize);
    
    // Modifica el grupo de personas agregando los datos del carousel (propiedades de cada celda)
    return groupSkills.map( function(p, i) {
      // Las celdas son todas iguales excepto en su angulo de presentación
      p.cellWidth = carouselAttrs.cellSize;
      p.cellHeight = carouselAttrs.cellSize;
      p.cellRadius = carouselAttrs.radius;
      // El único atributo de celda distintivo, el resto son iguales para todas ya que se apoya en el transform del div padre (carousel)
      p.cellAngle = carouselAttrs.angle * i;
      p.cellIndex = i;
      return p;
    })
}

carouselAttributes = function(cellCount, sceneSize) {
    // Función helper para devolver atributos iniciales del carousel según el tamaño del equipo y de la escena
    
    // Margen de la celda a la escena
    const cellMargin = 10;
  
    // Atributos del carousel
    return {
      cellMargin: cellMargin,
      cellCount: cellCount,
      angle: 360 / cellCount,
      cellSize: sceneSize - cellMargin * 2,
      radius: Math.round((sceneSize / 2) / Math.tan( Math.PI / cellCount ))
    }
}

rotateCarousel = function(carousel, direction = 1) {
    // Rota el carousel modificando el estilo CSS transform. Si direction > 0 => rota el carousel a la derecha
    
    // Se computa el nuevo índice (celda a mostrar) según dirección
    var idx = parseInt(carousel.attr('selected-index'));
    if (direction > 0)
      idx = idx < (carousel.attr('cellCount') - 1) ? (idx + 1) : 0;
    else
      idx = idx > 0 ? (idx - 1) : (carousel.attr('cellCount') - 1);
    // Se modifica el índice nuevo en el div del carousel
    carousel.attr('selected-index', idx);
    
    // Se recalcula el ángulo a cual rotar
    const currentAngle = carousel.attr('angle') * idx * -1;
    
    // Se modifica el estilo CSS transform para que rote el div carousel
    carousel.style('transform', `translateZ(-${parseInt(carousel.attr('radius'))}px) rotateY(${currentAngle}deg)`);
    
    return carousel;
}

togglePersonSelection = function(carouselCell) {
    // Funcion para cambiar la seleccion de persona en la celda de equipo
    const carousel = d3.select(carouselCell.node().parentNode);
    const idx = parseInt(carouselCell.attr('index'));
  
    // Valores de estilo para personas seleccionadas
    var opacity = 1;
    var border = '#c44';
    
    if (d3.select('.scatterlayer').selectAll(`.trace:nth-child(${idx + 1})`).style('opacity') == 1) {
      // Estilos para personas no seleccionadas
      opacity = 0.5;
      border = '#333';
    }
    // Setea los estilos en la celda y polar chart
    carouselCell.style('border-color', border);
    d3.select('.scatterlayer').selectAll(`.trace:nth-child(${idx + 1})`).style('opacity', opacity);
}

htmlPersonCell = function(personData) {
    // Genera el html para la persona (falta convertir a d3)
    return `
    <svg width="${personData.cellWidth}" height="${personData.cellHeight}">
     <g>
      <rect x="0" y="0" width="${personData.cellWidth}" height="${personData.cellHeight}" fill="rgb(245,245,245)" />
      <text x="50%" y="15%" dominant-baseline="middle" text-anchor="middle" font-family="Verdana" font-size="30" fill="grey">${personData.nombre}</text>
      <text x="50%" y="30%" dominant-baseline="middle" text-anchor="middle" font-family="Verdana" font-size="15" fill="grey">${personData.nombre}@gmail.com</text>
      <text x="50%" y="80%" dominant-baseline="middle" text-anchor="middle" font-family="Verdana" font-size="16" fill="grey">Popularity Index</text>
      <text x="50%" y="93%" dominant-baseline="middle" text-anchor="middle" font-family="Verdana" font-size="20" fill="green">${personData.max_score}</text>
      <img src="https://bit.ly/2ZosJEA" class="clip-circle">
    </g>
  </svg>`
  }


updateCoverageNotification = function(groupSkills) {
    const tc = teamCoverage(groupSkills, selectedFailures);
    const globalClass = (tc.coverage) ? 'bg-success' : 'bg-danger';
    const globalPerc = Math.round(1.0 * (tc.diff_values.length - tc.missing_skills.length) / tc.diff_values.length * 100);
    var html = '';
    tc.missing_skills.forEach( function(d) {
        const skillPerc = Math.round(1.0 * d.max_value / d.req_value * 100);
        html += `<h4 class="small font-weight-bold">${d.name}<span class="float-right">${skillPerc} %</span></h4>
                <div class="progress mb-4">
                <div class="progress-bar bg-info" role="progressbar" style="width: ${skillPerc}%" aria-valuenow="${skillPerc}" aria-valuemin="0" aria-valuemax="100"></div>
                </div>`;
    });
    html += `<h4 class="small font-weight-bold">Cobertura Global de Skills del Equipo<span class="float-right">${globalPerc} %</span></h4>
    <div class="progress">
      <div class="progress-bar ${globalClass}" role="progressbar" style="width: ${globalPerc}%" aria-valuenow="${globalPerc}" aria-valuemin="0" aria-valuemax="100"></div>
    </div>`;

    d3.select('#cobertura-skills-card').html(html);
}